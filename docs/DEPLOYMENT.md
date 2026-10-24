# 프로덕션 배포 · v1.2.0

2026-10-24. 사용자 요청에 따라 개발·검증·GitHub 반영·기존 Vercel 프로덕션 배포를 완료했다.

- 서비스: https://project-integrated-wondaes-projects-fe5c826b.vercel.app
- 현재 배포: https://project-integrated-8llnp901q-wondaes-projects-fe5c826b.vercel.app
- 대시보드: https://vercel.com/wondaes-projects-fe5c826b/project-integrated/3yvtsUfEhgAabRUMGcoxcPZhNFFi
- 저장소: https://github.com/jengjunseo/Project-Integrated
- 앱 commit: `8a5da51855f1ec271ad3057ae0ed89c6d72d47b9`, main. 이후 배포 보고서 전용 commit은 앱 산출물을 바꾸지 않는다.
- 배포 ID: `dpl_3yvtsUfEhgAabRUMGcoxcPZhNFFi`, production, READY, aliasError=null.
- 팀 `team_NPAeLtWZKTzyFZjgL4TYmmRn`, 프로젝트 `prj_qFfWKbTQjxqkIU0vzDVGYNk31JNO` 및 실제 commit·alias를 API로 확인했다.
- 기존 Vercel Authentication `all_except_custom_domains` 보호 유지. 인증을 해제하거나 공개 우회 링크를 만들지 않았다.

## 실제 응답과 화면 검증

서비스 alias에서 인증된 vercel curl로 HTML·catalog·worker·JS·CSS·보완 그림 5개·원본 참고 1쪽, 합계 11개 응답을 받았다. 모두 HTTP 200이며 검증한 dist와 바이트 단위로 일치한다. HTML에는 CSP·nosniff가 적용되고 worker는 Cache-Control=no-cache다. 크기·SHA-256은 deployment-verification.json에 기록했다.

실제 catalog는 v1.2.0, 원본 135쪽, 기본 학습 339개, 보존 레코드 470개, 문항·해설 개념 123개, 공식 그림 5개다. 과거 사진 학습 131개는 기본 출제에서 제외한다. 학습 자료와 그림은 자동 저장하고 원본 참고 사진은 열 때 저장한다.

사용자가 열어 둔 실제 서비스 탭에 이전 v1.0 화면이 캐시되어 있었다. 진행 중인 세션이 없음을 시작 버튼으로 확인하고, 기존 설정 화면의 새 버전 적용으로 기록을 유지하며 갱신했다. 실제 홈에서 ‘전체 범위 · 10개 소단원’, ‘학습 자료 189개’, ‘별도 다운로드 없이 바로 학습’, ‘범위 조정’, ‘전체 학습 자료 · 오프라인 준비됨’을 확인했다. 이전 범위 저장·팩 다운로드 화면이 기본 흐름에서 사라졌다.

동일한 dist를 Edge 모바일 환경에서 도메인 22/22, 브라우저 20/20 검사했다. 완전한 네트워크 차단, 열어 본 적 없는 보완 그림 5개, 손상 자동 캐시, 원본 참고 캐시, 범위 제외 유지, 기존 기록·백업 및 worker 갱신을 검증했다. 실제 S26 Ultra·Android PWA 설치 검사는 수행하지 않았다.

## 재현과 보호

Windows Vercel CLI 빌더의 기존 spawn 오류 때문에 tools/prepare-vercel.mjs로 검증한 dist를 공식 Build Output API v3 형식으로 묶어 prebuilt 배포했다. CLI 결과에서 기존 서비스 alias가 이미 연결되어 별도 중복 promote는 하지 않았다.

공개 Git에는 교재 PDF·원본 사진·전사 데이터·인증 파일을 넣지 않는다. 비공개 자료를 복원한 체크아웃에서 빌드·검사·배포한다. 자료 없는 공개 Git의 자동 빌드를 막는 git.deploymentEnabled=false를 유지한다. 기록을 지우거나 보호 설정을 낮추지 않는다.

이전 v1.1 롤백 참고: `dpl_B1n565j1NUWXSFtaUWCXvgSyNjy9`, https://project-integrated-pt3ufb6a0-wondaes-projects-fe5c826b.vercel.app.
