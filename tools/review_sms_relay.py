"""리뷰 요청 문자 — 병원 PC 중계 (2026-11-27).

왜: 솔라피는 문자(SMS·LMS·MMS) 발송 권한을 고정 IP를 지정한 키에서만 쓰게 하고, 클라우드 공급사 대역은 고정 IP로 치지 않는다.
    그래서 직원허브 서버 함수(Supabase 클라우드)는 솔라피에 바로 못 보낸다. 키의 허용 IP인 병원 PC에서 이 프로그램이 돈다.
하는 일(1분마다, 보낼 수 있는 시간 밖에는 5분마다 — 11-27 원장 「10분마다 갱신은 오바다」 뒤 줄임):
  ① review_sms_relay_claim — 허브 대기함(review_sms_outbox)에서 보낼 줄을 꺼냄(한 번 꺼낸 줄은 다시 안 꺼냄)
  ② 솔라피 send-many/detail로 발송
  ③ review_sms_relay_done — 결과를 기록하고 대기함에서 번호를 지움
  ④ 솔라피 상태 조회(잔액·포인트·발신번호·잔액 부족 알림·자동 충전·카카오 채널·알림톡 템플릿·최근 문자)는
     중계 시작 · 발송 뒤 · 매일 09시 · 원장 화면 「솔라피 상태 새로 확인」 단추(review_sms.relay_refresh_req) 때만
  ⑤ 30분마다 살아 있음만 허브에 적음(솔라피 조회 없음 · 마지막 조회 값 그대로) — 허브 「병원 PC 중계」 줄
환자 리뷰 문자는 원장 결정(11-27)으로 영구 중지 — 허브 DB가 막아서 대기함에는 원장 내부 번호 시험만 들어옴.
비밀값: C:\\Users\\elusi\\.secrets\\api-keys.env 의 SOLAPI_API_KEY · SOLAPI_API_SECRET_KEY · SUPABASE_ACCESS_TOKEN_CODEX
        (Supabase 서비스 키는 이 토큰으로 그때그때 받아 메모리에만 둠 · 어떤 값도 화면·기록에 쓰지 않음).
기록: 이 파일 옆 logs\\relay_YYYYMM.log (번호는 끝 4자리만).
비밀값 파일이 바뀌면(저장 시각이 달라지면) 다음 바퀴에 다시 읽음 — 11-27 사고: 07:23에 읽은 옛 SECRET을 콘솔 재생성 뒤에도 7시간 씀.
알림(11-27 추가): 솔라피 호출(잔액 조회·발송)이 2번 연속 실패하면 원장 폰(매크로드로이드 웹훅 — 잔액 알림과 같은 통로)과
      T0 우편함(ai_mail, 깨우지 않음)에 한 줄. 같은 오류는 1시간에 1번만. 알린 뒤 정상으로 돌아오면 「복구됨」 한 줄.
      상태 파일 logs\\alert_state.json(값 없음).
실행: pythonw review_sms_relay.py          계속 돎(작업 스케줄러 「HubReviewSmsRelay」가 로그인 때·10분마다 살아 있는지 확인)
      python review_sms_relay.py --once   한 번만 돌고 끝(점검용)
      python review_sms_relay.py --status 솔라피 잔액·발신번호·허브 연결만 확인(보내지 않음)
      python review_sms_relay.py --test-alert  알림 통로(폰·T0 우편함) 시험 한 줄만 보냄
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
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REF = "texevhsxttfoqkrucfzl"
SUPA = f"https://{REF}.supabase.co"
SOLAPI = "https://api.solapi.com/"
SEND_PATH = "messages/v4/send-many/detail"
ENV_FILE = r"C:\Users\elusi\.secrets\api-keys.env"
HERE = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(HERE, "logs")
POLL_SEC, IDLE_SEC, ALIVE_SEC = 60, 300, 1800
DAILY_CHECK = dt.time(9, 0)    # 매일 이 시각 뒤 첫 바퀴에 솔라피 상태 한 번
KST = dt.timezone(dt.timedelta(hours=9))
UA = "hub-review-sms-relay/1"
ALERT_AFTER_FAILS = 2          # 솔라피 호출이 이만큼 연속 실패하면 알림
ALERT_REPEAT_SEC = 3600        # 같은 오류는 1시간에 1번만
AI_MAIL = r"C:\Users\elusi\.claude\scripts\ai_mail.py"
T0_SESSION = "fee6f1ba"        # T0 총괄 7차(우편함 받는 대화 앞 8자리)
NO_WINDOW = 0x08000000         # 창 안 띄움(CREATE_NO_WINDOW)


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
    """supabase/functions/review-sms/core.mjs mapSolapiResult와 같은 규칙.
    접수된 줄(messageList)에는 받는 번호가 없어서(2026-11-27 실제 응답) 실패가 없고 개수가 같으면 보낸 순서로 맞춘다."""
    if not (200 <= status < 300) or not isinstance(body, dict):
        why = f"HTTP {status}"
        if isinstance(body, dict):
            why = " ".join(str(x) for x in (body.get("errorCode"), body.get("errorMessage")) if x) or why
        return [{"log_id": r["log_id"], "status": "failed", "provider_id": None, "error": short(why)} for r in pending]
    failed = body.get("failedMessageList") if isinstance(body.get("failedMessageList"), list) else []
    sent = body.get("messageList") if isinstance(body.get("messageList"), list) else []
    gi = body.get("groupInfo") if isinstance(body.get("groupInfo"), dict) else {}
    group_id = gi.get("groupId") if isinstance(gi.get("groupId"), str) else gi.get("_id") if isinstance(gi.get("_id"), str) else None
    by_order = not failed and len(sent) == len(pending)
    used: set[str] = set()
    out = []
    for idx, r in enumerate(pending):
        f = next((x for i, x in enumerate(failed) if f"f{i}" not in used and isinstance(x, dict) and x.get("to") == r["to_number"] and not used.add(f"f{i}")), None)
        if f:
            out.append({"log_id": r["log_id"], "status": "failed",
                        "provider_id": short(f.get("messageId"), 120) if isinstance(f.get("messageId"), str) else None,
                        "error": short(" ".join(str(x) for x in (f.get("statusCode"), f.get("statusMessage")) if x)) or "failed"})
            continue
        m = next((x for i, x in enumerate(sent) if f"m{i}" not in used and isinstance(x, dict) and x.get("to") == r["to_number"] and not used.add(f"m{i}")), None)
        if m is None and by_order and f"m{idx}" not in used and isinstance(sent[idx], dict):
            used.add(f"m{idx}")
            m = sent[idx]
        mid = m.get("messageId") if m and isinstance(m.get("messageId"), str) else group_id
        out.append({"log_id": r["log_id"], "status": "sent", "provider_id": short(mid, 120) if mid else None, "error": None})
    return out


def send_phone(text: str) -> str:
    """원장 폰 — 잔액 알림들과 같은 매크로드로이드 웹훅(주소는 비밀값 파일, 기록에 안 남김)."""
    env = read_env(("MACRODROID_WEBHOOK_URL_BALANCE", "MACRODROID_WEBHOOK_URL"))
    url, channel = env.get("MACRODROID_WEBHOOK_URL_BALANCE", ""), "macrodroid_balance"
    if url.startswith("https://"):
        url += ("&" if "?" in url else "?") + "msg=" + urllib.parse.quote(text)
    else:
        url, channel = env.get("MACRODROID_WEBHOOK_URL", ""), "macrodroid_fixed_ping"
    if not url.startswith("https://"):
        return "폰 통로 없음"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20) as r:
            r.read()
        return channel
    except Exception as e:
        return f"{channel} 실패({type(e).__name__})"


def send_t0_mail(subject: str, body: str) -> str:
    """T0 우편함(ai_mail) — 깨우지 않음. 창 안 띄움.
    ai_mail은 같은 이름끼리(claude→claude) 못 보내서, 초인종 멈춤 알림(doorbell_stall_alert.py)처럼
    claude 받는 칸에는 codex 이름으로 보냄(보낸 쪽은 이 중계 프로그램 — 본문 머리에 적음)."""
    exe = sys.executable
    py = exe[:-len("pythonw.exe")] + "python.exe" if exe.lower().endswith("pythonw.exe") else exe
    if not os.path.exists(py):
        py = exe
    cmd = [py, AI_MAIL, "send", "--from", "codex", "--to", "claude", "--session", T0_SESSION,
           "--no-wake", "--subject", subject, "--body", "[보낸 곳: 병원 PC 리뷰문자 중계 프로그램] " + body]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=60, creationflags=NO_WINDOW)
        return "mail ok" if r.returncode == 0 else f"mail 실패 rc={r.returncode}"
    except Exception as e:
        return f"mail 실패({type(e).__name__})"


class Alerter:
    """솔라피 호출 연속 실패 알림. 상태 파일에는 횟수·오류 요지·시각만(값 없음)."""

    def __init__(self, state_path: str | None = None, phone=None, mail=None) -> None:
        self.path = state_path or os.path.join(LOG_DIR, "alert_state.json")
        self.phone = phone or send_phone
        self.mail = mail or send_t0_mail
        try:
            with open(self.path, encoding="utf-8") as f:
                self.state = json.load(f)
            if not isinstance(self.state, dict):
                self.state = {}
        except Exception:
            self.state = {}
        self.state.setdefault("fails", 0)
        self.state.setdefault("last", {})
        self.state.setdefault("alerted", False)

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    def failure(self, error: str, now: float | None = None) -> str | None:
        now = time.time() if now is None else now
        self.state["fails"] = int(self.state.get("fails") or 0) + 1
        sent = None
        if self.state["fails"] >= ALERT_AFTER_FAILS:
            k = str(error)[:80]
            if now - float(self.state["last"].get(k) or 0) >= ALERT_REPEAT_SEC:
                text = (f"[리뷰문자 중계] 솔라피 호출 {self.state['fails']}번 연속 실패 — {str(error)[:120]} "
                        f"(병원 PC {socket.gethostname()}) · 지금 리뷰 문자가 안 나감")
                sent = f"phone={self.phone(text)} mail={self.mail('리뷰문자 중계 솔라피 연속 실패', text)}"
                self.state["last"][k] = now
                self.state["alerted"] = True
        self._save()
        return sent

    def success(self) -> str | None:
        sent = None
        if self.state.get("alerted"):
            text = (f"[리뷰문자 중계] 솔라피 호출 복구됨 — {self.state.get('fails')}번 연속 실패 뒤 정상 "
                    f"(병원 PC {socket.gethostname()})")
            sent = f"phone={self.phone(text)} mail={self.mail('리뷰문자 중계 복구', text)}"
        if self.state.get("fails") or self.state.get("alerted"):
            self.state["fails"], self.state["alerted"] = 0, False
            self._save()
        return sent


class Relay:
    def __init__(self, alerter: Alerter | None = None) -> None:
        self._env_mtime: float | None = None
        self.load_env()
        self._service = ""
        self.last_alive = 0.0
        self.last_info: dict = {}
        self.force_check = True        # 시작하면 솔라피 상태 한 번
        self.refresh_seen: str | None = None
        self.daily_done: dt.date | None = None
        self.last_error: str | None = None
        self.balance_ok: bool | None = None
        self.alerter = alerter

    def load_env(self) -> None:
        env = read_env(("SOLAPI_API_KEY", "SOLAPI_API_SECRET_KEY", "SUPABASE_ACCESS_TOKEN_CODEX"))
        self.key = env.get("SOLAPI_API_KEY", "")
        self.secret = env.get("SOLAPI_API_SECRET_KEY", "")
        self.pat = env.get("SUPABASE_ACCESS_TOKEN_CODEX", "")
        try:
            self._env_mtime = os.path.getmtime(ENV_FILE)
        except OSError:
            self._env_mtime = None

    def reload_env_if_changed(self) -> bool:
        try:
            m = os.path.getmtime(ENV_FILE)
        except OSError:
            return False
        if m == self._env_mtime:
            return False
        old_pat = self.pat
        self.load_env()
        if self.pat != old_pat:
            self._service = ""
        log("env reloaded (비밀값 파일 저장 시각이 바뀜 — 값은 기록 안 함)")
        self.force_check = True  # 바로 다음 바퀴에 잔액 조회로 새 값 확인
        return True

    def _note(self, ok: bool, error: str | None = None) -> None:
        if not self.alerter:
            return
        r = self.alerter.success() if ok else self.alerter.failure(error or "솔라피 호출 실패")
        if r:
            log(f"alert {'recovered' if ok else 'sent'} {r}")

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
            self._note(False, short(f"발송 호출 오류 {type(e).__name__}", 120))
            return [{"log_id": r["log_id"], "status": "failed", "provider_id": None, "error": short(f"중계 발송 오류: {e}")} for r in rows]
        if 200 <= st < 300:
            self._note(True)
        else:
            msg = data.get("errorMessage") if isinstance(data, dict) else None
            self._note(False, short(f"솔라피 발송 실패 HTTP {st} {msg or ''}".strip(), 120))
        return map_solapi_result(rows, st, data)

    # --- 한 바퀴 -------------------------------------------------------------
    def status(self) -> dict:
        info: dict = {"relay": "pc", "host": socket.gethostname(), "error": None,
                      "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}
        try:
            st, bal = self.solapi("GET", "cash/v1/balance")
        except Exception as e:  # 연결 실패도 솔라피 호출 실패로 셈
            st, bal = 0, {"errorMessage": f"연결 오류 {type(e).__name__}"}
        self.balance_ok = st == 200 and isinstance(bal, dict)
        if self.balance_ok:
            info["balance"], info["point"] = bal.get("balance"), bal.get("point")
            la = bal.get("lowBalanceAlert") if isinstance(bal.get("lowBalanceAlert"), dict) else None
            if la:
                lst = la.get("balances") if isinstance(la.get("balances"), list) else []
                info["low_alert"] = {"on": bool(la.get("enabled")), "at": lst[0] if lst else la.get("notificationBalance")}
            if "autoRecharge" in bal:
                info["auto_recharge"] = bool(bal.get("autoRecharge"))
        else:
            info["error"] = f"솔라피 잔액 조회 실패 HTTP {st} {short((bal or {}).get('errorMessage') if isinstance(bal, dict) else bal, 120)}"
        st, senders = self.solapi("GET", "senderid/v1/numbers/active")
        sender = "".join(ch for ch in self.setting("review_sms.sender") if ch.isdigit())
        if sender:
            info["sender_tail"] = sender[-4:]
        if st == 200 and isinstance(senders, list):
            info["sender_ok"] = bool(sender) and sender in senders
            if sender and sender not in senders and not info["error"]:
                info["error"] = "허브 발신번호가 솔라피에 등록된 번호가 아님"
        info.update(self.extras())
        return info

    def extras(self) -> dict:
        """원장 「기타 알파」 — 카카오 채널·알림톡 템플릿·최근 문자. 하나가 실패해도 나머지는 적고, 알림 횟수에는 안 셈."""
        out: dict = {}
        try:
            st, ch = self.solapi("GET", "kakao/v2/channels?limit=20")
            st2, tp = self.solapi("GET", "kakao/v2/templates?limit=100")
            if st == 200 and isinstance(ch, dict) and st2 == 200 and isinstance(tp, dict):
                tl = [t for t in (tp.get("templateList") or []) if isinstance(t, dict)]
                ok = sum(1 for t in tl if t.get("status") == "APPROVED")
                wait = sum(1 for t in tl if t.get("status") in ("INSPECTING", "PENDING"))
                out["kakao"] = {"channels": len(ch.get("channelList") or []), "approved": ok, "inspecting": wait, "other": len(tl) - ok - wait}
        except Exception:
            pass
        try:
            st, ml = self.solapi("GET", "messages/v4/list?limit=1")
            items = ml.get("messageList") if isinstance(ml, dict) else None
            first = next(iter(items.values()), None) if isinstance(items, dict) else (items[0] if isinstance(items, list) and items else None)
            if st == 200 and isinstance(first, dict):
                out["last_msg"] = {"at": first.get("dateCreated"), "type": first.get("type"), "tail": str(first.get("to") or "")[-4:],
                                   "status": short(first.get("reason") or first.get("status") or first.get("statusCode"), 40)}
        except Exception:
            pass
        return out

    def heartbeat(self, force: bool = False, why: str = "") -> None:
        """솔라피 상태 조회 + 허브에 적기. force가 아니면 정해진 때(시작·새로 확인 요청·매일 09시)만."""
        if not force and not self.check_due():
            return
        info = self.status()
        self._note(bool(self.balance_ok), info.get("error"))
        if self.last_error and not info.get("error"):
            info["error"] = self.last_error
        self.rpc("review_sms_relay_heartbeat", {"p_status": info})
        self.last_info, self.last_alive, self.force_check = info, time.monotonic(), False
        if now_kst().time() >= DAILY_CHECK:
            self.daily_done = now_kst().date()   # 오늘 09시 뒤에 이미 조회했으면 매일 조회는 건너뜀
        log(f"heartbeat{(' ' + why) if why else ''} balance={info.get('balance')} point={info.get('point')} sender_ok={info.get('sender_ok')} "
            f"kakao={info.get('kakao')} error={info.get('error')}")

    def check_due(self) -> bool:
        if self.force_check:
            return True
        req = self.setting("review_sms.relay_refresh_req").strip()
        if self.refresh_seen is None:
            self.refresh_seen = req           # 시작 전에 있던 요청은 시작 조회로 갈음
        elif req and req != self.refresh_seen:
            self.refresh_seen = req
            log("refresh requested (원장 화면 「솔라피 상태 새로 확인」)")
            return True
        now = now_kst()
        if now.time() >= DAILY_CHECK and self.daily_done != now.date():
            self.daily_done = now.date()
            return True
        return False

    def alive(self) -> None:
        """30분마다 살아 있음만(솔라피 조회 없음) — 마지막 조회 값에 seen_at만 새로."""
        if time.monotonic() - self.last_alive < ALIVE_SEC or not self.last_info:
            return
        self.rpc("review_sms_relay_heartbeat", {"p_status": self.last_info})
        self.last_alive = time.monotonic()

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
        self.heartbeat(force=True, why="after-send")
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
    if "--test-alert" in argv:
        text = f"[시험] 리뷰문자 중계 알림 통로 시험 — 무시해도 됨 (병원 PC {socket.gethostname()})"
        print(f"phone={send_phone(text)} mail={send_t0_mail('리뷰문자 중계 알림 시험', text)}")
        return 0
    if "--status" in argv:
        info = Relay().status()
        print(json.dumps(info, ensure_ascii=False))
        return 0 if not info.get("error") else 1
    relay = Relay(alerter=Alerter())
    lock = acquire_lock()
    if lock is None:
        if "--once" in argv:
            print("다른 중계가 이미 돌고 있음 — 끝냄")
        return 0
    log(f"start pid={os.getpid()} {'once' if '--once' in argv else 'loop'}")
    while True:
        try:
            relay.reload_env_if_changed()
            relay.tick()
            relay.heartbeat()
            relay.alive()
        except Exception as e:  # 한 바퀴 실패는 기록만 하고 다음 바퀴에 다시
            log(f"error {type(e).__name__}: {short(e, 300)}")
        if "--once" in argv:
            return 0
        time.sleep(POLL_SEC if in_send_window() else IDLE_SEC)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
