# 데이터 모델

## 원본과 표시 자료

원본 PDF는 변경하지 않으며 문서 ID·파일 SHA-256·크기·쪽수를 기록한다. `content/private/corrections.json`은 OCR 원문과 검수 문장·이유·영역을 연결한다. `public/content/catalog.json`은 표시 블록·가림·목차·페이지·팩 manifest이다. 원본 이미지와 원문 텍스트의 표기 정규화는 비교 연산과 분리한다.

`social/science` → `s01…s10/c01…c12` 소단원 → `s01-u001` 단위 → `-b1` 블록 → target ID 구조다. 현재 ID는 검수 입력의 소단원별 추가 순서로 부여한다. 기존 입력을 재정렬·삭제하지 않고 뒤에 추가한다. 기존 내용을 교정할 때는 ID를 유지하고 revision과 팩 version을 올리는 명시적 변경이 필요하다. 제목을 ID로 사용하지 않는다.

블록 종류는 text/table/diagram/image/chart/network/pyramid. chart는 rows·chartUnit·chartYear로 교재 수치와 시점을 보존한다. 표의 열 제목·행 머리글을 보존한다. 가림은 blockId, 정확한 expectedText, startUtf16/endUtf16으로 연결하며 빌드와 런타임에서 부분 문자열 일치를 검증한다. 그림의 box는 크롭 내부 0–1 좌표이고 sourceBox는 표시 페이지 내부 좌표다. boxes는 한 용어의 여러 출현 위치를 같은 target 번호로 가린다. 전체 페이지 이미지는 별도 재인코딩 없이 팩의 원본 페이지 파일을 참조한다. 새 명시적 ID는 s02-e005-01, s02-page005와 같고 초기 171개 ID·revision·원문·target을 SHA-256 fixture로 회귀 검사한다. 사회 74–81쪽은 시계 방향 90도 보정했고 manifest에 원본→표시 변환을 기록했다.

공식 보완은 origin=official, page=0, sourceUrl/sourceLabel로 교재 원문과 분리한다. 출처 없는 텍스트를 원문으로 표시하지 않는다. 수식은 문자로 재구성하며, 복잡한 보완 그림은 Block.illustration에 내부 이미지 경로·원출처·저작자·이용 조건을 보존한다. 원문 회상 중 그림은 가려 답을 노출하지 않는다.

sourceRole은 concept/exam-concept/reference/source-page/exam-source로 자료 유형을 분리한다. Page.unitIds/relatedUnitIds/duplicateOf는 전체 135쪽의 학습 연결과 중복을 명시한다. 누락된 질문 연결은 빌드가 실패한다. 원본의 오답 선지를 무조건 사실로 전사하지 않는다.

## 저장과 평가

IndexedDB `original-recall` v1의 state/current에 schemaVersion=1 상태를 보관한다. 하나의 readwrite 트랜잭션이 events와 session snapshot을 함께 기록한다. revision 비교 후 쓰며 다른 탭의 변경은 BroadcastChannel과 트랜잭션 비교로 감지한다. 실패는 화면에 남고 재저장·백업을 제공한다. 입력은 180ms, 스크롤은 250ms 지연 저장하며 화면 숨김·나가기 때도 저장한다. 운영체제가 프로세스를 즉시 종료한 경우 마지막 지연 입력까지 보장할 수는 없다.

세션은 선택 원문 영역 imageRegion(정규화 Box, 선택값) 및 queue/seed/index/phase/attemptId/answers/assistance/responseCommittedAt/revealedAt/scroll/zoom/output/mode/scope/packVersion을 담는다. 상태는 reading→recall→compare→다음 단위 또는 ended. 같은 attemptId의 평가는 한 번만 기록한다. 모르겠음의 임시 놓침은 동일 ID의 최종 자기평가로 교정한다. 되돌리기는 원본 이벤트를 삭제하지 않고 undo 이벤트로 취소하며 이전 입력 snapshot을 복원한다.

rating은 missed/partial/full, literalMatch는 NFC+양끝 공백 제거 후 정확 일치, assistance는 source/hint/reveal이다. 의미 자동 채점은 없다. 노출(exposure), 고유 학습 단위, 시도 수, 도움 없는 full을 구분한다.

imageRegion은 원본 페이지에서 사용자가 선택한 문단·표·그림이다. 그 영역을 확대 크롭하고 전부 가린다. 문자 정답을 추정하지 않으며 빠른 복원과 자기평가를 사용한다. rating/exposure에 영역 좌표를 보관하고 다음 원문에서는 초기화, undo에서는 이전 영역을 복원한다. 백업 검증은 잘못된 좌표를 거절한다. 기존 스키마 1 백업은 선택 필드가 없어도 그대로 읽는다.

## 복습

기록에서 일정 snapshot을 계산하는 schedulerVersion=1. Asia/Seoul 자정 기준이며 첫 공식 시도는 다음 날, 기한이 된 full은 1/3/7/14/30일 단계로 전진한다. 놓침/모르겠음은 0단계, 일부·도움은 한 단계 낮추고 다음 날이다. 자유 랜덤·노출·기한 전 연습은 공식 일정을 변경하지 않는다. 오늘 복습의 새 원문은 과목 합산 하루 5개 기본, 누적 없음. first exposure와 first attempt를 고유 ID로 세며 중복 합산하지 않는다. seed shuffle 후 가능한 한 같은 family 사이에 다른 3개를 둔다. 부족하면 반복 출제하지 않고 짧게 끝낸다.

## 자동 저장과 백업

소단원 manifest 22개는 자산 URL/bytes/SHA-256 검증과 이전 자료 호환에만 사용한다. 사용자별 다운로드 절차는 없다. 학습 가능한 자료는 studyEnabled!==false이고, 과거 사진 학습 131개는 false로 보존한다. 시작·재개·개별 학습에서는 원본 이미지 다운로드를 기다리지 않는다.

worker는 HTML·코드·catalog와 학습용 그림 5개를 자동으로 가져와 크기·SHA-256을 확인한다. 손상이나 중단 시 새 worker를 활성화하지 않는다. 다음 재실행에서 다시 준비한다. 원본 사진은 열 때 검증·저장하며 v1.1의 팩 캐시도 검증 후 재사용한다. 학습 기록은 삭제하지 않는다.

Preferences.scopeVersion=2는 전체 범위를 한 번 기본 지정하는 전환 표시다. 이후 빈 범위도 사용자 선택으로 유지한다. 미완료 사진 큐는 Page.relatedUnitIds의 학습 가능한 자료로 교체하되 이미 평가한 접두부와 과거 이벤트를 바꾸지 않는다. 현재 자료가 바뀌었을 때만 입력·회상 상태를 초기화한다.

앱 shell 버전은 HTML·JS·CSS·catalog 내용의 해시다. 학습 중에는 새 worker를 waiting 상태로 유지한다. 세션이 없는 홈에서 새 worker가 준비되면 저장 완료를 확인하고 자동 적용·재실행하며, 학습 종료 뒤 수동 적용도 제공한다. 캐시나 앱 업데이트가 IndexedDB를 지우지 않는다. 현재 schemaVersion=1만 허용하고 미래 버전·손상된 백업을 거절한다. 아직 v2 마이그레이션은 없으며 스키마 변경 시 별도 migration과 왕복 검증이 필요하다.

백업 envelope는 format=original-recall-backup, formatVersion=1, createdAt, packs, data. 자료 이미지를 포함하지 않는다. ID로 이벤트를 병합하고 같은 ID의 내용이 다르면 전체 가져오기를 중단한다. 반복 가져오기는 멱등적이다. 가져온 설정을 적용하되 현재 진행 중인 세션과 설치 팩 상태는 유지한다. 오래된 이벤트의 원문 revision/packVersion은 덮어쓰지 않는다.
