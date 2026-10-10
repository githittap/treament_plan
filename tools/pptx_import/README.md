# pptx_import — PPT를 업무매뉴얼 덱(JSON + 장별 바탕 webp)으로 가져오기

1. 준비: `pip install python-pptx Pillow lxml pywin32` + PowerPoint(기본 렌더러, COM) + poppler(`--renderer lo`일 때만 LibreOffice·`pdftoppm`). PPT는 읽기만 하니 사본을 `--src`로 줌. 실행은 `python -P`(사용자 site-packages 사용).
2. 전체: `python -P import_pptx.py --src 사본.pptx --out 출력폴더 --work 임시폴더` → `출력폴더\images\slideNNN.webp`, `deck.json`, `report.json`, `progress.log` (끝나면 우리가 띄운 PowerPoint는 종료, 원래 떠 있던 건 그대로 둠).
3. 일부만: `--only 84,85`(범위 `84-90`) / `--append-from 318`(N장부터) — 기존 `deck.json`에 `srcSlide` 기준으로 덮어쓰거나 합침. `--renderer lo`로 LibreOffice 렌더.
4. 규칙: 맨 위 글 상자=`title`, 나머지 글 상자=`label`, 연결선=`arrow`(순서대로 `step`). 그림이 든 그룹 안 글(A~L 칸 글자)은 바탕에 둠(`--group-text extract`로 전부 떼기).
5. 확인: `--overlay`는 `compare\`에 비교 그림(`_PP비교.jpg` 등), `--score`는 원본 렌더에서 뽑은 화살표 경로와 실제 선의 일치율(`score.json`)만 계산.
