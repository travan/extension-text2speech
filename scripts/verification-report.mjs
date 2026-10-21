import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeVerificationReport(directory, manifest) {
  const read = (name) => { try { return JSON.parse(readFileSync(join(directory, name), "utf8")); } catch { return null; } };
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const pct = (value) => Number.isFinite(value) ? (100 * value).toFixed(2) + "%" : "—";
  const benchmark = read("relevance-benchmark.json");
  const sources = [
    ["Unit · mocks", "unit.json", "vitest"], ["HTTP transport · real sockets", "transport.json", "vitest"],
    ["Browser UI · Chrome/speech/network mocks", "e2e.json", "playwright"],
    ["Built extension · real APIs and DOM", "extension.json", "playwright"],
    ["Original local model smoke", "local-smoke.json", "vitest"],
    ["Expanded local model benchmark", "benchmark-tests.json", "vitest"],
  ];
  const counts = sources.map(([label, file, type]) => {
    const data = read(file);
    return {
      label, file, passed: type === "vitest" ? data?.numPassedTests : data?.stats?.expected,
      failed: type === "vitest" ? data?.numFailedTests : data?.stats?.unexpected,
      skipped: type === "vitest" ? data?.numPendingTests : data?.stats?.skipped,
      flaky: type === "vitest" ? 0 : data?.stats?.flaky,
    };
  });
  const html = [
    '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Topic Reader — Verification</title><style>',
    'body{font:16px/1.55 system-ui,sans-serif;max-width:1120px;margin:32px auto;padding:0 20px;color:#17253a;background:#f7f9fc}',
    'h1,h2{line-height:1.2}h2{margin-top:32px}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;border:1px solid #dce3ed;text-align:left;vertical-align:top}',
    'th{background:#edf2f8}.pass{color:#086b40}.fail{color:#b51d35}.muted{color:#516277}code{overflow-wrap:anywhere}a{color:#075fba}details{padding:12px;background:white;margin:16px 0}.bad{background:#fff0f1}.badge{font-weight:bold;font-size:1.3em}pre{white-space:pre-wrap;overflow-wrap:anywhere}',
    '</style><body><h1>Topic Reader — Báo cáo kiểm chứng</h1>',
    '<p class="badge ' + (manifest.passed ? 'pass' : 'fail') + '">' + (manifest.passed ? 'PASS' : 'FAIL') + ' theo tiêu chí đã định trước</p>',
    '<p>Chạy lúc ' + escape(manifest.startedAt) + ' · Node ' + escape(manifest.node) + ' · ' + escape(manifest.platform) + '/' + escape(manifest.arch) + '</p>',
    '<p class="muted">PASS không có nghĩa model đúng 100%. Xem các quyết định sai và phạm vi kiểm chứng bên dưới. Không dùng tài khoản mạng xã hội hoặc profile Chrome cá nhân.</p>',
    '<h2>Kết quả các bộ test</h2><table><thead><tr><th>Bộ kiểm thử</th><th>Đạt</th><th>Lỗi</th><th>Bỏ qua</th><th>Flaky</th><th>Dữ liệu gốc</th></tr></thead><tbody>',
    ...counts.map((c) => '<tr><td>' + escape(c.label) + '</td><td>' + escape(c.passed ?? "—") + '</td><td>' + escape(c.failed ?? "—") + '</td><td>' + escape(c.skipped ?? "—") + '</td><td>' + escape(c.flaky ?? "—") + '</td><td><a href="' + c.file + '">JSON</a></td></tr>'),
    '</tbody></table><p><a href="e2e-html/index.html">Báo cáo giao diện & traces</a> · <a href="extension-html/index.html">Báo cáo extension & traces</a></p>',
    '<h2>Các bước chạy</h2><table><tr><th>Bước</th><th>Exit code</th><th>Thời gian</th><th>Log</th></tr>',
    ...manifest.phases.map((p) => '<tr><td>' + escape(p.name) + '</td><td>' + escape(p.skipped ?? p.exitCode) + '</td><td>' + ((p.durationMs || 0) / 1000).toFixed(2) + 's</td><td><a href="' + escape(p.log) + '">Log đầy đủ</a></td></tr>'),
    '</table>',
  ];
  if (benchmark) {
    html.push('<h2>Chất lượng Local AI</h2><p>Model: <strong>' + escape(benchmark.model) + '</strong>. 96 đoạn riêng biệt × 2 lượt = 192 quyết định. Thứ tự giữa các đoạn đồng điểm từ khóa được đảo; ranker vẫn ưu tiên điểm từ khóa.</p>',
      '<p>Ngưỡng: ' + benchmark.threshold + '. Tiêu chí: precision ≥90%, recall ≥90%, độ chính xác mỗi nhóm ≥75%, đồng thuận giữa hai lượt ≥95%.</p>',
      '<table><tr><th>Chế độ</th><th>Đúng / tổng</th><th>Precision</th><th>Recall</th><th>F1</th><th>FP / FN</th></tr>',
      ...["basic", "local"].map((name) => { const m = benchmark[name]; return '<tr><td>' + name + '</td><td>' + (m.tp + m.tn) + ' / ' + m.total + '</td><td>' + pct(m.precision) + '</td><td>' + pct(m.recall) + '</td><td>' + pct(m.f1) + '</td><td>' + m.fp + ' / ' + m.fn + '</td></tr>'; }),
      '</table><p>Đồng thuận khi đổi thứ tự: ' + pct(benchmark.agreement) + '. Median / p95 mỗi lượt 12 đoạn: ' + benchmark.latencyMs.median + ' / ' + benchmark.latencyMs.p95 + ' ms.</p>',
      '<h2>Theo nhóm chủ đề</h2><table><tr><th>Nhóm</th><th>Đúng / tổng</th><th>Precision</th><th>Recall</th></tr>',
      ...Object.entries(benchmark.byGroup).map(([name, m]) => '<tr><td>' + escape(name) + '</td><td>' + (m.tp + m.tn) + ' / ' + m.total + '</td><td>' + pct(m.precision) + '</td><td>' + pct(m.recall) + '</td></tr>'),
      '</table><h2>Các trường hợp model sai</h2>',
      benchmark.mistakes.length ? '<table><tr><th>ID / lượt</th><th>Văn bản</th><th>Kỳ vọng</th><th>Model</th><th>Điểm</th></tr>' +
        benchmark.mistakes.map((r) => '<tr class="bad"><td>' + escape(r.id) + ' / ' + (r.repeat + 1) + '</td><td>' + escape(r.text) + '</td><td>' + r.expected + '</td><td>' + r.local + '</td><td>' + r.score + '</td></tr>').join("") + '</table>' : '<p>Không có trong lần chạy này.</p>',
      '<details><summary>Xem toàn bộ 192 quyết định</summary><table><tr><th>ID / lượt</th><th>Văn bản</th><th>Kỳ vọng</th><th>Model</th><th>Điểm</th></tr>',
      ...benchmark.runs.flatMap((run) => run.rows.map((r) => '<tr' + (r.local === r.expected ? '' : ' class="bad"') + '><td>' + escape(r.id) + ' / ' + (run.repeat + 1) + '</td><td>' + escape(r.text) + '</td><td>' + r.expected + '</td><td>' + r.local + '</td><td>' + r.score + '</td></tr>')),
      '</table></details><p><a href="relevance-benchmark.json">JSON đầy đủ: nhãn, điểm, lỗi, thời gian và metadata model</a></p>',
      '<p class="muted">Bộ dữ liệu tổng hợp do agent viết, chưa có nhãn độc lập từ người dùng. Không suy rộng các tỷ lệ này thành độ chính xác trên Facebook/Threads/X. Kiểm thử giọng đọc chỉ kiểm tra hàng đợi và điều khiển, không đánh giá âm thanh. Local AI vẫn giới hạn 40 đoạn và 1.200 ký tự mỗi đoạn.</p>');
  }
  html.push('<h2>Truy xuất và tái hiện</h2><p>Lệnh: <code>npm run verify</code>. Mã nguồn giữ nguyên trong lúc chạy: <strong>' + escape(manifest.sourcesUnchanged) + '</strong>.</p>',
    '<p>Source SHA-256: <code>' + escape(manifest.sourceDigest) + '</code></p>',
    '<p><a href="manifest.json">Manifest</a> · <a href="input-hashes.json">Hashes mã nguồn & dữ liệu</a> · <a href="artifact-hashes.json">Hashes bằng chứng</a></p></body></html>');
  writeFileSync(join(directory, "report.html"), html.join("\n"));
}
