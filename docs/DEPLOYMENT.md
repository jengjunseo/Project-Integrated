# 프로덕션 배포

- 서비스: https://project-integrated-wondaes-projects-fe5c826b.vercel.app
- 배포: https://project-integrated-338i0nv40-wondaes-projects-fe5c826b.vercel.app
- 대시보드: https://vercel.com/wondaes-projects-fe5c826b/project-integrated/5GndTJrxrTdCoFMpaw3mvXioHtEW
- 저장소: https://github.com/jengjunseo/Project-Integrated
- 애플리케이션 commit: `2dae8adaaba6066396009a01b08673b854a5e088` (main)
- 배포 ID: `dpl_5GndTJrxrTdCoFMpaw3mvXioHtEW`, target=production, READY, aliasError=null.
- 기존 `all_except_custom_domains` Vercel Authentication 보호 유지. 인증 후 접근한다. 보호 해제나 공개 우회 링크를 배포하지 않았다.

## 확인한 실제 응답

CLI의 인증된 `vercel curl`로 확인했다. `/` HTTP 200, Content-Type text/html, CSP·nosniff 보안 헤더 적용. HTML 바이트는 검증한 dist/index.html과 동일하다. `/content/catalog.json` 227,466 bytes가 로컬과 바이트 단위로 같으며 원본 135쪽·학습 단위 171개·팩 22개를 포함한다. `/content/regions/c10-u009.png` 원본 생태 피라미드 그림도 바이트 동일하다. 실제 서비스 alias의 `/sw.js`는 HTTP 200, application/javascript, Cache-Control=no-cache이며 로컬과 동일하다. Vercel API에서 READY와 서비스 alias 연결을 재확인한 뒤 promote를 완료했다.

브라우저 E2E는 동일한 프로덕션 dist를 로컬 HTTPS 예외인 localhost에서 수행했다. 배포 후 SSO를 통과한 S26 Ultra의 실제 브라우저/PWA 설치는 수행하지 못했다. 이 구분을 유지한다.

## 배포 방식

Vercel CLI 65.1.0의 Windows 로컬 빌더가 의존성 설치 후 `spawn cmd.exe ENOENT`로 종료했다. 앱 자체 `npm run build`는 정상 통과했다. 공식 Build Output API v3에 따라 tools/prepare-vercel.mjs로 검증된 정적 dist를 .vercel/output/static에 묶고 헤더/라우트를 설정한 후 `deploy --prebuilt --prod --skip-domain` 및 검증 후 `promote`를 사용했다. 실제 배포에는 빌드 스크립트 실행이나 서버 함수가 필요하지 않다. 공개 Git에서 제외한 교재 자산은 보호된 정적 배포 파일에 포함했다. 비밀 환경 변수/CLI 인증 파일은 복사하지 않았다.

원문·그림·교정 입력은 공개 저장소에 없다. 사용자 로컬의 비공개 자료 묶음을 복원해야 재현할 수 있다. 이후 Git 자동 배포를 사용하려면 자료를 별도로 안전하게 공급하는 단계가 필요하다. 현재 배포는 로컬 prebuilt 방식으로 재현한다. 다음 버전은 검증 후 promote하고 문제 시 이 배포로 되돌릴 수 있다.
