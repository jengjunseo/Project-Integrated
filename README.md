# 통사·통과 원문 복원기

제공된 스캔에서 확인한 원문을 읽고, 가리고, 같은 위치에서 대조하는 개인 학습 PWA. 빠른 회상과 직접 입력, 자기평가, 복습 일정, 원본 열람, 소단원별 오프라인 팩과 기록 백업을 제공한다. 학습 중 AI API나 외부 서버 저장은 사용하지 않는다.

사용자의 추가 요청에 따라 KDI·기상청·한국과학창의재단·서울특별시교육청 자료 4개를 별도 출처의 보완 학습으로 포함했다. 교재 원문과 보완 설명을 혼동하지 않도록 표시한다.

## 실행

Node.js 24.x, npm, Edge 또는 Chromium 계열 브라우저. Python 3.11 이상은 자료 재처리에만 필요하다.

```powershell
npm ci
# 인계한 비공개 자료 묶음의 public/content를 같은 경로에 복원
npm run dev
npm test
npm run build
npm run preview -- --port 4173
npm run test:e2e
```

브라우저 테스트는 설치된 Edge를 사용한다. 다른 환경에서는 playwright.config.ts의 channel을 변경하고 해당 브라우저를 설치한다. 앱은 ES2022, IndexedDB, Cache Storage, Service Worker, Web Crypto를 사용하며 HTTPS 또는 localhost가 필요하다.

## 자료 준비

이 공개 저장소에는 교재 PDF·페이지 이미지·전사 데이터·인증 정보를 올리지 않는다. 비공개 자료 묶음에는 검수 입력과 생성된 public/content를 포함한다. 원본 PDF는 사용자가 제공한 파일을 그대로 보관한다.

```powershell
python -m pip install -r tools/requirements.txt
python tools/render.py --pdf-dir PDF폴더 --output-dir 작업페이지폴더
powershell -NoProfile -File tools/ocr.ps1 -InputDirectory 작업페이지폴더 -OutputDirectory OCR폴더
python tools/ingest.py --pdf-dir PDF폴더 --pages-dir 작업페이지폴더 --ocr-dir OCR폴더 --curated content/private/curated.py
npm run build
```

Windows OCR은 한국어 언어 팩이 필요하다. OCR 출력은 정답으로 자동 승격하지 않는다. 전체 135쪽을 렌더링·분류했으며 **선택 구간 검수**를 완료했다. 교재 본문 전체의 전사·검수가 끝난 상태는 아니다. 상세 범위는 [콘텐츠 감사](docs/CONTENT_AUDIT.md)에 기록했다.

## 배포

대상은 기존 Vercel `wondaes-projects-fe5c826b/project-integrated`. 기존 배포 보호를 유지한다. 비공개 자료가 없는 Git 체크아웃을 그대로 자동 배포하면 콘텐츠 검증에서 실패한다. 아래 명령은 자료가 준비된 로컬 체크아웃에서 실행한다.

```powershell
vercel link --project project-integrated --scope wondaes-projects-fe5c826b --yes
vercel pull --yes --environment=production --scope wondaes-projects-fe5c826b
vercel build --prod
vercel deploy --prebuilt --prod --skip-domain --scope wondaes-projects-fe5c826b
vercel curl / --deployment 배포URL
vercel promote 배포URL --scope wondaes-projects-fe5c826b --yes
```

업데이트 전 기록을 백업한다. 새 Service Worker는 진행 중인 묶음이 끝날 때까지 적용하지 않는다. 보고서는 [요구 추적](docs/REQUIREMENTS_TRACE.md), [데이터 모델](docs/DATA_MODEL.md), [QA](docs/QA_REPORT.md), [성능](docs/PERFORMANCE_REPORT.md), [사용·운영 인계](docs/HANDOFF.md)를 참조한다.
