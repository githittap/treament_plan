# pptx_import — PPT를 업무매뉴얼 덱(JSON + 장별 바탕 webp)으로 가져오기

1. 준비: `pip install python-pptx Pillow lxml pywin32` + PowerPoint(기본 렌더러, COM) + poppler(`--renderer lo`일 때만 LibreOffice·`pdftoppm`). PPT는 읽기만 하니 사본을 `--src`로 줌. 실행은 `python -P`(사용자 site-packages 사용).
2. 전체: `python -P import_pptx.py --src 사본.pptx --out 출력폴더 --work 임시폴더` → `출력폴더\images\slideNNN.webp`, `deck.json`, `report.json`, `progress.log` (끝나면 우리가 띄운 PowerPoint는 종료, 원래 떠 있던 건 그대로 둠).
3. 일부만: `--only 84,85`(범위 `84-90`) / `--append-from 318`(N장부터) — 기존 `deck.json`에 `srcSlide` 기준으로 덮어쓰거나 합침. `--renderer lo`로 LibreOffice 렌더.
4. 규칙: 맨 위 글 상자=`title`, 나머지 글 상자=`label`, 연결선=`arrow`(순서대로 `step`). 그림이 든 그룹 안 글(A~L 칸 글자)은 바탕에 둠(`--group-text extract`로 전부 떼기).
5. 확인: `--overlay`는 `compare\`에 비교 그림(`_PP비교.jpg` 등), `--score`는 원본 렌더에서 뽑은 화살표 경로와 실제 선의 일치율(`score.json`)만 계산.
6. 허브에 올리기: `node tools/pptx_import/upload_deck.mjs --deck <deck.json> --images <그림 폴더>` — 기본은 올릴 목록·용량만 출력(dry-run). 실제 실행은 `--execute`(원장 승인 뒤, 키 이름 `SUPABASE_SERVICE_ROLE_KEY` 를 `C:\Users\elusi\.secrets\api-keys.env` 에서 읽음, 값은 출력·저장 안 함).
   - 새 덱: 그림을 `manual-media/<id>/slideNNN.webp` 로 올리고 비공개 한 행을 넣음. 덱 JSON 에 `importedSrc`(가져온 srcSlide 목록)가 저장됨. 그림은 어떤 경우에도 덮어쓰지 않음(같은 이름이 있으면 내용이 같을 때만 건너뜀).
   - `--update-images --deck-id <id>`: srcSlide 가 같은 장의 바탕 그림만 새 이름(`slideNNN.<해시>.webp`)으로 바꿈 — 허브에서 고친 화살표·글은 보존.
   - `--append --deck-id <id>`: importedSrc 에 없는 새 장만 덧붙임. 허브에서 지운 장은 importedSrc 에 남아 있어 다시 붙지 않음(정말 다시 넣을 때만 `--force-src 84,85`). importedSrc 가 없는 옛 덱은 현재 장들로 시작함.
   - 기존 덱 고치기는 읽은 시점의 updated_at 이 그대로일 때만 저장(충돌이면 다시 읽어 재시도, 4번 실패하면 멈춤).
