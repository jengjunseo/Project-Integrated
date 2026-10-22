# 데이터 모델

## 원본과 표시 자료

원본 PDF는 변경하지 않으며 문서 ID·파일 SHA-256·크기·쪽수를 기록한다. `content/private/corrections.json`은 OCR 원문과 검수 문장·이유·영역을 연결한다. `public/content/catalog.json`은 표시 블록·가림·목차·페이지·팩 manifest이다. 원본 이미지와 원문 텍스트의 표기 정규화는 비교 연산과 분리한다.

`social/science` → `s01…s10/c01…c12` 소단원 → `s01-u001` 단위 → `-b1` 블록 → target ID 구조다. 현재 ID는 검수 입력의 소단원별 추가 순서로 부여한다. 기존 입력을 재정렬·삭제하지 않고 뒤에 추가한다. 기존 내용을 교정할 때는 ID를 유지하고 revision과 팩 version을 올리는 명시적 변경이 필요하다. 제목을 ID로 사용하지 않는다.

블록 종류는 text/table/diagram/image. 표의 열 제목·행 머리글을 보존한다. 가림은 blockId, 정확한 expectedText, startUtf16/endUtf16으로 연결하며 빌드와 런타임에서 부분 문자열 일치를 검증한다. 그림의 box는 크롭 내부 0–1 좌표이고 sourceBox는 표시 페이지 내부 좌표다. 사회 74–81쪽은 시계 방향 90도 보정했고 manifest에 원본→표시 변환을 기록했다.

공식 보완은 origin=official, page=0, sourceUrl/sourceLabel로 교재 원문과 분리한다. 출처 없는 텍스트를 원문으로 표시하지 않는다. 복잡한 수식·그림은 원본 영역 이미지를 함께 제공한다.

## 저장과 평가

IndexedDB `original-recall` v1의 state/current에 schemaVersion=1 상태를 보관한다. 하나의 readwrite 트랜잭션이 events와 session snapshot을 함께 기록한다. revision 비교 후 쓰며 다른 탭의 변경은 BroadcastChannel과 트랜잭션 비교로 감지한다. 실패는 화면에 남고 재저장·백업을 제공한다. 입력은 180ms, 스크롤은 250ms 지연 저장하며 화면 숨김·나가기 때도 저장한다. 운영체제가 프로세스를 즉시 종료한 경우 마지막 지연 입력까지 보장할 수는 없다.

세션은 queue/seed/index/phase/attemptId/answers/assistance/responseCommittedAt/revealedAt/scroll/zoom/output/mode/scope/packVersion을 담는다. 상태는 reading→recall→compare→다음 단위 또는 ended. 같은 attemptId의 평가는 한 번만 기록한다. 모르겠음의 임시 놓침은 동일 ID의 최종 자기평가로 교정한다. 되돌리기는 원본 이벤트를 삭제하지 않고 undo 이벤트로 취소하며 이전 입력 snapshot을 복원한다.

rating은 missed/partial/full, literalMatch는 NFC+양끝 공백 제거 후 정확 일치, assistance는 source/hint/reveal이다. 의미 자동 채점은 없다. 노출(exposure), 고유 학습 단위, 시도 수, 도움 없는 full을 구분한다.

## 복습

기록에서 일정 snapshot을 계산하는 schedulerVersion=1. Asia/Seoul 자정 기준이며 첫 공식 시도는 다음 날, 기한이 된 full은 1/3/7/14/30일 단계로 전진한다. 놓침/모르겠음은 0단계, 일부·도움은 한 단계 낮추고 다음 날이다. 자유 랜덤·노출·기한 전 연습은 공식 일정을 변경하지 않는다. 오늘 복습의 새 원문은 과목 합산 하루 5개 기본, 누적 없음. first exposure와 first attempt를 고유 ID로 세며 중복 합산하지 않는다. seed shuffle 후 가능한 한 같은 family 사이에 다른 3개를 둔다. 부족하면 반복 출제하지 않고 짧게 끝낸다.

## 팩과 백업

소단원 팩 22개. 각 자산은 URL/bytes/SHA-256을 가진다. 개별 캐시가 남아 있어도 완료 marker를 쓰기 전에는 준비 완료로 표시하지 않는다. 중단 후 검증한 파일을 재사용한다. 완료 후 누락된 캐시를 발견하면 온라인에서 재설치한다. 팩 삭제는 학습 기록과 별개이며 진행 중인 묶음이 사용하는 팩 삭제는 막는다.

앱 shell 버전은 HTML·JS·CSS·catalog 내용의 해시다. 새 worker는 waiting 상태로 두며 명시적으로 적용할 때 controllerchange 후 재시작한다. 캐시나 앱 업데이트가 IndexedDB를 지우지 않는다. 현재 schemaVersion=1만 허용하고 미래 버전·손상된 백업을 거절한다. 아직 v2 마이그레이션은 없으며 스키마 변경 시 별도 migration과 왕복 검증이 필요하다.

백업 envelope는 format=original-recall-backup, formatVersion=1, createdAt, packs, data. 자료 이미지를 포함하지 않는다. ID로 이벤트를 병합하고 같은 ID의 내용이 다르면 전체 가져오기를 중단한다. 반복 가져오기는 멱등적이다. 가져온 설정을 적용하되 현재 진행 중인 세션과 설치 팩 상태는 유지한다. 오래된 이벤트의 원문 revision/packVersion은 덮어쓰지 않는다.
