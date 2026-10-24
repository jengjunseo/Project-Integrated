import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const r = JSON.parse(await readFile("test-results/results.json", "utf8"));
const tests = [];
let perf;
function walk(x) {
  if (!x || typeof x !== "object") return;
  if (x.title && x.tests)
    for (const t of x.tests)
      tests.push({
        title: x.title,
        status: t.status,
        duration: t.results.reduce((n, r) => n + r.duration, 0),
      });
  if (x.attachments)
    for (const a of x.attachments)
      if (a.name === "transition-latencies")
        perf = JSON.parse(Buffer.from(a.body, "base64").toString());
  for (const [k, v] of Object.entries(x))
    if (k !== "attachments" && v && typeof v === "object")
      Array.isArray(v) ? v.forEach(walk) : walk(v);
}
walk(r);
if (!perf || r.stats.unexpected || r.stats.flaky || r.stats.skipped)
  throw Error("Complete passing report required");
const stats = (a) => {
  const s = [...a].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: s[Math.ceil(s.length * 0.5) - 1],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};
const frame = stats(perf.clickToSecondAnimationFrame),
  roundtrip = stats(perf.samples);
const files = await readdir("dist/assets");
const size = async (extension) => {
  const b = await readFile(
    "dist/assets/" + files.find((name) => name.endsWith(extension)),
  );
  return `${(b.length / 1000).toFixed(2)}kB / gzip ${(gzipSync(b).length / 1000).toFixed(2)}kB`;
};
const js = await size(".js"),
  css = await size(".css");
await writeFile(
  "docs/qa-results.json",
  JSON.stringify(
    { run: r.stats, tests, performance: { ...perf, frame, roundtrip } },
    null,
    2,
  ),
);
await writeFile(
  "docs/PERFORMANCE_REPORT.md",
  `# 성능 보고\n\n측정 실행: ${r.stats.startTime}. Windows 호스트, Node 24.12, Edge headless, 412×915 CSS px / DPR 2 / mobile touch. Android 실기기 결과가 아니다. 브라우저: ${perf.userAgent}.\n\n## 100회 혼합 자료 전환\n\n텍스트·표·순서도·통계 그래프·관계도·영양 단계 도형을 섞은 고유 단위 100개를 사용했다. 평가→원자적 IndexedDB 저장→다음 자료 표시를 반복했다. 모션은 즉시 모드이며 현재/다음 그림을 미리 디코딩한다. 표본은 개발 테스트용 세션이다.\n\n|측정|n|p50 ms|p95 ms|max ms|\n|---|---:|---:|---:|---:|\n|평가 click 이벤트 수신→DOM 변경 후 두 번째 animation frame|${frame.n}|${frame.p50.toFixed(1)}|${frame.p95.toFixed(1)}|${frame.max.toFixed(1)}|\n|Playwright 평가 click 명령 왕복→보이는 카드 확인|${roundtrip.n}|${roundtrip.p50.toFixed(1)}|${roundtrip.p95.toFixed(1)}|${roundtrip.max.toFixed(1)}|\n\n첫 지표는 브라우저 내부 performance.now와 MutationObserver/rAF로 측정했으며 물리 입력 지연과 실제 화면 스캔아웃은 포함하지 않는다. 두 번째 지표는 자동화 통신·대기 비용이 포함된 보조값이다. 물리 기기의 INP 또는 120Hz 프레임 성능으로 해석하지 않는다. 치명적 JS 오류 0건, 기록 ID 중복 0건. 최근 재실행 NavigationTiming의 loadEventEnd는 ${perf.navigation[0].loadEventEnd.toFixed(1)}ms이나 학습 원문 준비 완료 시각을 뜻하지 않는다.\n\n## 크기와 수정\n\n프로덕션 JS ${js}, CSS ${css}. 학습 자료와 공개 그림 5개는 앱 shell과 함께 자동 저장한다. 최초 학습을 다운로드로 차단하지 않는다. 무거운 원본 페이지·썸네일·과거 크롭은 열 때 크기와 SHA-256을 확인해 저장하며 기본 학습에 출제하지 않는다. 외부 폰트·분석 스크립트·학습 중 AI 요청은 없다. 가림 폭/높이를 먼저 측정하고 공개 때 유지한다. 위치를 움직이던 등장 효과는 불투명도 변화만 남겼다. 오프라인 Vary:Origin 캐시 불일치, 설치 실패 뒤 버튼 비활성화 문제도 수정하고 회귀 검증했다.\n\n## 미측정\n\nS26 Ultra 실기기의 60/120Hz·절전·발열·배터리·실제 키보드, 20–30분 연속 사용과 메모리 추세, 물리 입력→표시·프레임 드롭, 웜 재실행 후 첫 학습 원문까지 1초 목표는 검증하지 못했다. 테스트 전체 시간이나 NavigationTiming을 이 항목의 통과 근거로 사용하지 않았다. 장기 누적 기록/구버전 팩 캐시 성능도 후속 검증이 필요하다. 원시 수치는 qa-results.json에 보존한다.\n`,
);
console.log(JSON.stringify({ tests: tests.length, frame, roundtrip }));
