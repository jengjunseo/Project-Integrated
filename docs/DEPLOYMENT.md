# 프로덕션 배포 · v1.1.0

- 서비스: https://project-integrated-wondaes-projects-fe5c826b.vercel.app
- 현재 배포: https://project-integrated-pt3ufb6a0-wondaes-projects-fe5c826b.vercel.app
- 대시보드: https://vercel.com/wondaes-projects-fe5c826b/project-integrated/B1n565j1NUWXSFtaUWCXvgSyNjy9
- 저장소: https://github.com/jengjunseo/Project-Integrated
- 애플리케이션 commit: `2db2b77d0e14e982ab3373c0e7ac27493c64fb50` (main). 이후 보고서 전용 commit은 앱 산출물을 바꾸지 않는다.
- 배포 ID: `dpl_B1n565j1NUWXSFtaUWCXvgSyNjy9`, production, READY, aliasError=null.
- 팀 `team_NPAeLtWZKTzyFZjgL4TYmmRn`, 프로젝트 `prj_qFfWKbTQjxqkIU0vzDVGYNk31JNO`를 배포 전후 확인했다.
- 기존 `all_except_custom_domains` Vercel Authentication 보호 유지. 보호 해제나 공개 우회 링크를 배포하지 않았다.

## 실제 서비스 응답 대조

인증된 `vercel curl`로 서비스 alias의 HTML·catalog·worker·문항 원본 이미지·최신 JS를 내려받았다. 모두 HTTP 200이며 검증한 dist와 바이트 단위로 일치한다. catalog 569,480 bytes에 v1.1.0, 135쪽, 자료 452개, 문항·해설 개념 123개, 그래프 3개가 포함된다. 모든 문항 쪽의 관련 개념 연결도 실제 응답에서 검사했다.

HTML에는 CSP·nosniff 헤더가 적용되고 `/sw.js`는 Cache-Control=no-cache이다. 정확한 크기와 SHA-256은 `deployment-verification.json`에 보존했다. API에서 실제 commit, READY, 서비스 alias 연결과 보호 설정을 재확인했다. CLI 결과에서 서비스 alias가 이미 연결되어 별도 중복 promote는 하지 않았다.

동일한 프로덕션 dist를 Windows Edge 모바일 viewport에서 검사했다. 도메인 20/20, 브라우저 18/18 통과. 배포 후 SSO를 통과한 S26 Ultra의 실제 브라우저/PWA 설치는 수행하지 못했다. 이 구분을 유지한다.

## 배포 재현과 갱신

초기 Windows CLI 빌더는 `spawn cmd.exe ENOENT`로 종료되었으나 앱 자체 빌드는 정상 통과했다. 공식 Build Output API v3 방식으로 검증한 dist를 `tools/prepare-vercel.mjs`로 묶고 로컬 prebuilt 배포를 사용한다. 원문 자료·인증 파일은 공개 Git에 없다. 교재를 포함한 비공개 자료 팩을 복원한 체크아웃에서 README 절차를 따른다.

자료 없는 공개 Git의 자동 빌드가 실패하던 문제는 `git.deploymentEnabled=false`로 자동 배포를 끄고 해결했다. 앱/자료를 함께 검사한 로컬 산출물을 배포한다. 이 설정은 인증 보호와 무관하다. 인증·환경 파일은 배포 산출물에 복사하지 않는다.

기존 앱 사용자는 진행 중인 묶음을 마치고 앱을 다시 연 뒤 설정의 새 버전 적용을 사용한다. 이전 앱에서는 새 worker가 준비된 뒤 설정을 다시 열면 버튼이 나타난다. 갱신 후 자료 버전 v1.1.0을 확인하고 선택 팩을 새 버전으로 받는다. 기존 기록을 삭제할 필요가 없다. 초기 171개 단위의 ID·revision·원문·정답 구간은 회귀 검사로 보존했다.

초기 v1.0 배포 기록: `dpl_5GndTJrxrTdCoFMpaw3mvXioHtEW`, https://project-integrated-338i0nv40-wondaes-projects-fe5c826b.vercel.app. 롤백 참고용이며 최신 서비스는 위 v1.1이다.
