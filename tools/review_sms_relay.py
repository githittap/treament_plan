"""리뷰 요청 문자 — 병원 PC 중계 (2026-11-27).

왜: 솔라피는 문자(SMS·LMS·MMS) 발송 권한을 고정 IP를 지정한 키에서만 쓰게 하고, 클라우드 공급사 대역은 고정 IP로 치지 않는다.
    그래서 직원허브 서버 함수(Supabase 클라우드)는 솔라피에 바로 못 보낸다. 키의 허용 IP인 병원 PC에서 이 프로그램이 돈다.
하는 일(20초마다, 보낼 수 있는 시간 밖에는 2분마다):
  ① review_sms_relay_claim — 허브 대기함(review_sms_outbox)에서 보낼 줄을 꺼냄(한 번 꺼낸 줄은 다시 안 꺼냄)
  ② 솔라피 send-many/detail로 발송
  ③ review_sms_relay_done — 결과를 기록하고 대기함에서 번호를 지움
  ④ 10분마다 review_sms_relay_heartbeat — 잔액·발신번호 상태를 허브에 적음(허브 「병원 PC 중계」 줄)
비밀값: C:\\Users\\elusi\\.secrets\\api-keys.env 의 SOLAPI_API_KEY · SOLAPI_API_SECRET_KEY · SUPABASE_ACCESS_TOKEN_CODEX
        (Supabase 서비스 키는 이 토큰으로 그때그때 받아 메모리에만 둠 · 어떤 값도 화면·기록에 쓰지 않음).
기록: 이 파일 옆 logs\\relay_YYYYMM.log (번호는 끝 4자리만).
실행: pythonw review_sms_relay.py          계속 돎(작업 스케줄러 「HubReviewSmsRelay」가 로그인 때·10분마다 살아 있는지 확인)
      python review_sms_relay.py --once   한 번만 돌고 끝(점검용)
      python review_sms_relay.py --status 솔라피 잔액·발신번호·허브 연결만 확인(보내지 않음)
정본: 저장소 githittap/treament_plan tools/review_sms_relay.py · 병원 PC 사본: Z:\\09_claude-output\\03_병원운영·전산\\T8_인프라\\review_sms_relay\\
끄기: 작업 스케줄러에서 HubReviewSmsRelay 사용 안 함 + 실행 중인 pythonw(review_sms_relay.py) 종료. 끄면 허브 대기함 줄은 2시간 뒤 「보내지 않음」으로 닫힘.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import socket
import sys
import time
import urllib.error
import urllib.request

REF = "texevhsxttfoqkrucfzl"
SUPA = f"https://{REF}.supabase.co"
SOLAPI = "https://api.solapi.com/"
SEND_PATH = "messages/v4/send-many/detail"
ENV_FILE = r"C:\Users\elusi\.secrets\api-keys.env"
HERE = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(HERE, "logs")
POLL_SEC, IDLE_SEC, HEARTBEAT_SEC = 20, 120, 600
KST = dt.timezone(dt.timedelta(hours=9))
UA = "hub-review-sms-relay/1"


def now_kst() -> dt.datetime:
    return dt.datetime.now(KST)


def log(msg: str) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    line = f"{now_kst():%Y-%m-%d %H:%M:%S} {msg}\n"
    with open(os.path.join(LOG_DIR, f"relay_{now_kst():%Y%m}.log"), "a", encoding="utf-8") as f:
        f.write(line)
    if sys.stdout and not sys.executable.lower().endswith("pythonw.exe"):
        try:
            print(line, end="")
        except Exception:
            pass


def read_env(names: tuple[str, ...]) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() in names:
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def http(method: str, url: str, headers: dict, body=None, timeout: int = 20):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    h = {"User-Agent": UA, **headers}
    if data is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"errorMessage": raw[:300]}


def short(x, n: int = 500):
    return None if x is None else str(x)[:n]


def map_solapi_result(pending: list[dict], status: int, body) -> list[dict]:
    """supabase/functions/review-sms/core.mjs mapSolapiResult와 같은 규칙."""
    if not (200 <= status < 300) or not isinstance(body, dict):
        why = f"HTTP {status}"
        if isinstance(body, dict):
            why = " ".join(str(x) for x in (body.get("errorCode"), body.get("errorMessage")) if x) or why
        return [{"log_id": r["log_id"], "status": "failed", "provider_id": None, "error": short(why)} for r in pending]
    failed = body.get("failedMessageList") if isinstance(body.get("failedMessageList"), list) else []
    sent = body.get("messageList") if isinstance(body.get("messageList"), list) else []
    gi = body.get("groupInfo") if isinstance(body.get("groupInfo"), dict) else {}
    group_id = gi.get("groupId") if isinstance(gi.get("groupId"), str) else None
    used: set[str] = set()
    out = []
    for r in pending:
        f = next((x for i, x in enumerate(failed) if f"f{i}" not in used and isinstance(x, dict) and x.get("to") == r["to_number"] and not used.add(f"f{i}")), None)
        if f:
            out.append({"log_id": r["log_id"], "status": "failed",
                        "provider_id": short(f.get("messageId"), 120) if isinstance(f.get("messageId"), str) else None,
                        "error": short(" ".join(str(x) for x in (f.get("statusCode"), f.get("statusMessage")) if x)) or "failed"})
            continue
        m = next((x for i, x in enumerate(sent) if f"m{i}" not in used and isinstance(x, dict) and x.get("to") == r["to_number"] and not used.add(f"m{i}")), None)
        mid = m.get("messageId") if m and isinstance(m.get("messageId"), str) else group_id
        out.append({"log_id": r["log_id"], "status": "sent", "provider_id": short(mid, 120) if mid else None, "error": None})
    return out


class Relay:
    def __init__(self) -> None:
        env = read_env(("SOLAPI_API_KEY", "SOLAPI_API_SECRET_KEY", "SUPABASE_ACCESS_TOKEN_CODEX"))
        self.key = env.get("SOLAPI_API_KEY", "")
        self.secret = env.get("SOLAPI_API_SECRET_KEY", "")
        self.pat = env.get("SUPABASE_ACCESS_TOKEN_CODEX", "")
        self._service = ""
        self.last_heartbeat = 0.0
        self.last_error: str | None = None

    # --- Supabase ---------------------------------------------------------
    def service_key(self, refresh: bool = False) -> str:
        if self._service and not refresh:
            return self._service
        if not self.pat:
            raise RuntimeError("SUPABASE_ACCESS_TOKEN_CODEX 없음")
        st, data = http("GET", f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true", {"Authorization": "Bearer " + self.pat})
        if st != 200 or not isinstance(data, list):
            raise RuntimeError(f"Supabase 키 받기 실패 HTTP {st}")
        pick = next((k for k in data if k.get("name") == "service_role"), None) or next((k for k in data if k.get("type") == "secret"), None)
        if not pick or not pick.get("api_key"):
            raise RuntimeError("Supabase 서비스 키 없음")
        self._service = pick["api_key"]
        return self._service

    def rpc(self, name: str, args: dict):
        for attempt in (0, 1):
            k = self.service_key(refresh=attempt == 1)
            st, data = http("POST", f"{SUPA}/rest/v1/rpc/{name}", {"apikey": k, "Authorization": "Bearer " + k}, args)
            if st in (401, 403) and attempt == 0:
                continue
            if not (200 <= st < 300):
                raise RuntimeError(f"{name} HTTP {st} {short(data, 200)}")
            return data
        raise RuntimeError(f"{name} 인증 실패")

    def setting(self, key: str) -> str:
        k = self.service_key()
        st, data = http("GET", f"{SUPA}/rest/v1/app_settings?key=eq.{key}&select=value", {"apikey": k, "Authorization": "Bearer " + k})
        return (data[0].get("value") or "") if st == 200 and isinstance(data, list) and data else ""

    # --- 솔라피 -------------------------------------------------------------
    def solapi_auth(self) -> str:
        if not self.key or not self.secret:
            raise RuntimeError("솔라피 키 없음(api-keys.env SOLAPI_API_KEY·SOLAPI_API_SECRET_KEY)")
        date = dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        salt = secrets.token_hex(16)
        sig = hmac.new(self.secret.encode(), (date + salt).encode(), hashlib.sha256).hexdigest()
        return f"HMAC-SHA256 apiKey={self.key}, date={date}, salt={salt}, signature={sig}"

    def solapi(self, method: str, path: str, body=None):
        st, data = http(method, SOLAPI + path, {"Authorization": self.solapi_auth()}, body, timeout=30)
        if isinstance(data, dict):  # 응답에 키가 섞여 나오는 일은 없지만, 기록에 남기기 전에 한 번 더 지움
            txt = json.dumps(data, ensure_ascii=False)
            if (self.key and self.key in txt) or (self.secret and self.secret in txt):
                data = {"errorMessage": "redacted"}
        return st, data

    def send(self, rows: list[dict]) -> list[dict]:
        body = {"messages": [{"to": r["to_number"], "from": r["sender"], "text": r["message_text"]} for r in rows], "showMessageList": True}
        try:
            st, data = self.solapi("POST", SEND_PATH, body)
        except Exception as e:  # 네트워크 오류 등 — 보냈는지 모르면 다시 보내지 않고 실패로 적음(두 번 가는 것 막기)
            return [{"log_id": r["log_id"], "status": "failed", "provider_id": None, "error": short(f"중계 발송 오류: {e}")} for r in rows]
        return map_solapi_result(rows, st, data)

    # --- 한 바퀴 -------------------------------------------------------------
    def status(self) -> dict:
        info: dict = {"relay": "pc", "host": socket.gethostname(), "error": None}
        st, bal = self.solapi("GET", "cash/v1/balance")
        if st == 200 and isinstance(bal, dict):
            info["balance"], info["point"] = bal.get("balance"), bal.get("point")
        else:
            info["error"] = f"솔라피 잔액 조회 실패 HTTP {st} {short((bal or {}).get('errorMessage') if isinstance(bal, dict) else bal, 120)}"
        st, senders = self.solapi("GET", "senderid/v1/numbers/active")
        sender = "".join(ch for ch in self.setting("review_sms.sender") if ch.isdigit())
        if st == 200 and isinstance(senders, list):
            info["sender_ok"] = bool(sender) and sender in senders
            if sender and sender not in senders and not info["error"]:
                info["error"] = "허브 발신번호가 솔라피에 등록된 번호가 아님"
        return info

    def heartbeat(self, force: bool = False) -> None:
        if not force and time.monotonic() - self.last_heartbeat < HEARTBEAT_SEC:
            return
        info = self.status()
        if self.last_error and not info.get("error"):
            info["error"] = self.last_error
        self.rpc("review_sms_relay_heartbeat", {"p_status": info})
        self.last_heartbeat = time.monotonic()
        log(f"heartbeat balance={info.get('balance')} point={info.get('point')} sender_ok={info.get('sender_ok')} error={info.get('error')}")

    def tick(self) -> int:
        rows = self.rpc("review_sms_relay_claim", {"p_limit": 10}) or []
        if not rows:
            return 0
        results = self.send(rows)
        n = self.rpc("review_sms_relay_done", {"p_results": results})
        tails = {r["log_id"]: str(r["to_number"])[-4:] for r in rows}
        for x in results:
            log(f"send ****{tails.get(x['log_id'])} {x['status']} {x.get('provider_id') or ''} {x.get('error') or ''}".rstrip())
        bad = [x for x in results if x["status"] != "sent"]
        self.last_error = short(f"최근 발송 실패: {bad[0].get('error')}", 200) if bad else None
        log(f"done {n}/{len(rows)}")
        self.heartbeat(force=True)
        return len(rows)


def in_send_window() -> bool:
    t = now_kst().time()
    return dt.time(8, 50) <= t <= dt.time(20, 10)


def acquire_lock():
    os.makedirs(LOG_DIR, exist_ok=True)
    f = open(os.path.join(LOG_DIR, "relay.lock"), "a+")
    try:
        import msvcrt
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        return None
    return f


def main(argv: list[str]) -> int:
    relay = Relay()
    if "--status" in argv:
        info = relay.status()
        print(json.dumps(info, ensure_ascii=False))
        return 0 if not info.get("error") else 1
    lock = acquire_lock()
    if lock is None:
        if "--once" in argv:
            print("다른 중계가 이미 돌고 있음 — 끝냄")
        return 0
    log(f"start pid={os.getpid()} {'once' if '--once' in argv else 'loop'}")
    while True:
        try:
            relay.tick()
            relay.heartbeat()
        except Exception as e:  # 한 바퀴 실패는 기록만 하고 다음 바퀴에 다시
            log(f"error {type(e).__name__}: {short(e, 300)}")
        if "--once" in argv:
            return 0
        time.sleep(POLL_SEC if in_send_window() else IDLE_SEC)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
