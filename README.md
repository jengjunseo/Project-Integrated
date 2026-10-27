# 통사·통과 원문 복원기

문장·표·도식을 읽고, 가리고, 같은 자리에서 대조하는 개인 학습 PWA. 학습 기록은 기기 안에 저장하며 학습 중 AI API를 호출하지 않는다.

## v1.2 사용 흐름

처음부터 두 과목의 22개 소단원을 모두 포함한다. 시작 버튼을 누르면 바로 학습하며, 범위를 줄이고 싶을 때만 소단원을 해제한다. 체크 변경은 즉시 저장되고 다음 묶음에 적용된다. 기존 v1.1 설정은 한 번 전체 범위로 전환하며 이후 해제한 항목은 유지한다.

기본 학습은 339개(문장·표·도식·그래프)이고 문항·해설 개념 123개를 포함한다. 표 54개는 HTML 표, 물·탄소 순환과 기권·수권·지권·생물권 연결은 웹 관계도, 생태피라미드는 웹 도형, 에너지 효율 식은 텍스트 수식이다. 복잡한 구조 그림 5개는 대학·NASA 원출처와 이용 조건을 표시해 화면 안에 제공한다. [시각자료 출처](docs/VISUAL_SOURCES.md).

학습 자료와 보완 그림은 앱이 자동으로 오프라인 저장한다. 학습 시작을 막는 팩 다운로드·범위 저장 버튼은 없다. 교재 원본 135쪽은 참고용으로 열 때 저장한다. 이전 사진 학습 131개는 기록 호환용 레코드로 보존하며 기본 출제와 자료 목록에서 제외한다. 모든 문장을 전사 완료했다는 뜻은 아니다. [변경 내역](docs/UX_UPDATE_v1.2.md).

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

이 공개 저장소에는 교재 PDF·페이지 이미지·전사 데이터·인증 정보를 올리지 않는다. 비공개 자료 묶음에는 curated.py·expansion.py·visuals.py·검수된 regions.json·official.json과 공개 그림, OCR·회전 후 OCR, 가림 좌표 증명 및 생성된 public/content를 포함한다. 원본 PDF는 사용자가 제공한 파일을 그대로 보관한다.

```powershell
python -m pip install -r tools/requirements.txt
python tools/render.py --pdf-dir PDF폴더 --output-dir 작업페이지폴더
powershell -NoProfile -File tools/ocr.ps1 -InputDirectory 작업페이지폴더 -OutputDirectory OCR폴더
python tools/ingest.py --pdf-dir PDF폴더 --pages-dir 작업페이지폴더 --ocr-dir OCR폴더 --curated content/private/curated.py
npm run build
```

Windows OCR은 한국어 언어 팩이 필요하다. OCR 출력은 정답으로 자동 승격하지 않는다. 전체 135쪽을 렌더링·분류했다. 원본 참고 열람과 검수한 문장·표·도식·그래프, 중복 6쪽의 연결, 사회 79쪽의 판독 해설 3개를 제공한다. 교재 본문 전체의 전사·검수가 끝난 상태는 아니다. 상세 범위는 [콘텐츠 감사](docs/CONTENT_AUDIT.md)에 기록했다.

## 배포

대상은 기존 Vercel `wondaes-projects-fe5c826b/project-integrated`. 기존 배포 보호를 유지한다. 비공개 자료가 없는 Git 체크아웃을 그대로 자동 배포하면 콘텐츠 검증에서 실패하므로 vercel.json의 git.deploymentEnabled=false로 자동 배포를 끄고 검증된 자료를 포함한 로컬 배포를 사용한다. [Vercel 공식 설정](https://vercel.com/docs/project-configuration/git-configuration)을 따른다. 아래 명령은 자료가 준비된 로컬 체크아웃에서 실행한다.

```powershell
vercel link --project project-integrated --scope wondaes-projects-fe5c826b --yes
vercel pull --yes --environment=production --scope wondaes-projects-fe5c826b
npm run build
node tools/prepare-vercel.mjs
vercel deploy --prebuilt --prod --skip-domain --scope wondaes-projects-fe5c826b
vercel curl / --deployment 배포URL
vercel promote 배포URL --scope wondaes-projects-fe5c826b --yes
```

Windows에서 Vercel CLI 빌더가 `spawn cmd.exe ENOENT`로 종료되어, 검증한 dist를 공식 Build Output API v3 형식으로 묶는 tools/prepare-vercel.mjs를 사용한다. 인증/환경 파일은 출력 폴더에 복사하지 않는다.

업데이트 전 기록을 백업한다. 새 Service Worker는 진행 중인 묶음이 끝날 때까지 적용하지 않는다. 보고서는 [요구 추적](docs/REQUIREMENTS_TRACE.md), [데이터 모델](docs/DATA_MODEL.md), [QA](docs/QA_REPORT.md), [성능](docs/PERFORMANCE_REPORT.md), [사용·운영 인계](docs/HANDOFF.md)를 참조한다.

## 남은 검증과 자료 작업

- [ ] 아직 전사·검수되지 않은 교재 본문 범위를 [콘텐츠 감사](docs/CONTENT_AUDIT.md)에 따라 검토한다.
- [ ] 비공개 자료 묶음을 복원한 격리 환경에서 빌드와 오프라인 학습·복구 흐름을 재검증한다.
