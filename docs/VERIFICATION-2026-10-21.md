# Kiểm chứng Topic Reader — 21/10/2026

Lần chạy hoàn chỉnh lúc 10:42–10:44 giờ Việt Nam: **134/134 test đạt**, không bỏ qua; typecheck và build thành công. Đã thêm 68 test so với bộ 66 test trước đó. Đây là kiểm chứng trên máy local bằng mã nguồn đang sửa, không phải bản phát hành đã commit.

[Báo cáo HTML](../artifacts/verification/2026-10-21T03-42-44-389Z/report.html) · [Manifest và lệnh chạy](../artifacts/verification/2026-10-21T03-42-44-389Z/manifest.json) · [Kết quả model từng đoạn](../artifacts/verification/2026-10-21T03-42-44-389Z/relevance-benchmark.json)

## Các bộ kiểm thử

| Bộ | Đạt | Phạm vi |
| --- | ---: | --- |
| Unit | 81 | Lọc nội dung, cấu hình, phản hồi AI sai định dạng, ngưỡng, fallback nguyên khối, timeout và địa chỉ loopback |
| HTTP transport | 4 | Fetch qua socket thật tới server giả lập local: chậm, redirect, 403, ngắt kết nối giữa các batch |
| Giao diện trình duyệt | 24 | Chrome API, giọng đọc và mạng dùng mock; hydration, kết quả cũ, autoscan, retry, lựa chọn, hàng đợi giọng đọc |
| Extension đã build | 7 | Chromium profile tạm, content script và Chrome storage/messaging thật; bài dài, dedup, capture/Stop, phân trang, tách dữ liệu tab; một luồng dùng Ollama thật |
| Local AI smoke | 1 | Ollama thật, 16 ví dụ gốc |
| Local AI benchmark | 17 | 8 nhóm × 2 lượt và kiểm tra ngưỡng chất lượng tổng thể |

HTTP transport dùng server kiểm thử, không phải Ollama; test abort rút deadline xuống 100 ms để kiểm tra cơ chế hủy. Test giao diện không chứng minh chất lượng âm thanh phát ra.

## Model thật và kết quả

Ollama tại `http://127.0.0.1:11434`, model `qwen3.5:9b`, digest `d63f830f28d515fefea546f213fca7a75e9dd5176ef51a6deabc952d1c99a911`.

[Bộ dữ liệu cố định](../tests/fixtures/relevance-v1.json) gồm **96 đoạn riêng biệt**, tiếng Việt/Anh, 8 nhóm chủ đề, mỗi nhóm 6 đoạn liên quan và 6 đoạn không liên quan. Có diễn đạt lại, không dấu, phủ định, đồng âm/khác nghĩa, nhắc thoáng qua và câu cố điều khiển model. Hai lượt tạo **192 quyết định**, không phải 192 tài liệu độc lập. Lượt sau đảo đầu vào; ranker vẫn sắp theo điểm từ khóa, vì vậy chủ yếu thay đổi thứ tự các đoạn đồng điểm.

| Chỉ số | Basic | Local AI |
| --- | ---: | ---: |
| Đúng/tổng | 124/192 | **191/192** |
| Accuracy | 64,58% | **99,48%** |
| Precision | 69,44% | **98,97%** |
| Recall | 52,08% | **100%** |
| False positive / false negative | 22 / 46 | **1 / 0** |

Đồng thuận giữa hai lượt: **95/96 = 98,96%**. Thời gian mỗi lượt 12 đoạn: median **3.749 ms**, p95 **4.585 ms**, trên máy và model này.

Tiêu chí cố định trước khi chạy: precision ≥90%, recall ≥90%, accuracy mỗi nhóm ≥75%, đồng thuận ≥95%, ngưỡng chọn đoạn 0,45. Nhãn và tiêu chí không được sửa để làm đẹp kết quả.

**Lỗi còn thấy:** `security-12`, “The security guard at the museum checks bags before visitors enter.” bị chọn nhầm cho chủ đề an ninh mạng ở lượt đầu, điểm 0,6; lượt đảo thứ tự trả đúng. PASS nghĩa là đạt tiêu chí đã định, không có nghĩa model luôn đúng.

Lần chạy đầy đủ trước đó (`2026-10-21T03-39-21-702Z`) được giữ nguyên: benchmark đúng 190/192, toàn suite FAIL do mock giọng đọc truyền đối tượng giả vào SpeechSynthesisUtterance native. Đã sửa fixture để mock đồng bộ hai phía rồi chạy lại toàn suite. Không sửa production code hay nhãn để xử lý lỗi này. Dao động 190–191/192 cho thấy suy luận chưa hoàn toàn ổn định.

## Bằng chứng và tái hiện

```sh
# Ollama đang chạy và có qwen3.5:9b
npm run verify
```

Mỗi lần chạy tạo thư mục thời gian riêng dưới `artifacts/verification/`, chứa JSON, log, ảnh và trace; kết quả cũ được giữ lại. Các artifact này nằm local và được Git ignore. `latest.json` chỉ tới lần chạy mới nhất.

Đã đối chiếu lại SHA-256 của **100 file bằng chứng** và **57 file đầu vào/mã nguồn**: tất cả khớp. Mã nguồn giữ nguyên trong lúc chạy. Hash là dấu vết đối chiếu, không phải chứng thực độc lập.

- Corpus SHA-256: `bb94bdd0d03a98d6c6390251a6398bc8e3895c53967ab0613bc650db55f113ee`.
- [Hash từng file bằng chứng](../artifacts/verification/2026-10-21T03-42-44-389Z/artifact-hashes.json).
- [Báo cáo giao diện có trace](../artifacts/verification/2026-10-21T03-42-44-389Z/e2e-html/index.html).
- [Báo cáo extension](../artifacts/verification/2026-10-21T03-42-44-389Z/extension-html/index.html). Trace extension lưu riêng trong `extension-artifacts/*/trace.zip`, chưa gắn vào giao diện báo cáo Playwright.
- [Trace extension kết nối Ollama thật](../artifacts/verification/2026-10-21T03-42-44-389Z/extension-artifacts/local-ai-built-extension-e-0d697-filters-through-real-Ollama/trace.zip). Mở bằng `npx playwright show-trace <đường-dẫn-trace.zip>`.

Báo cáo HTML đã được mở bằng Chromium và kiểm tra hiển thị, không có lỗi JavaScript.

## Phạm vi chưa được chứng minh

Bộ dữ liệu do agent tạo, chưa được người dùng gán nhãn độc lập; trang extension là fixture local, chưa đại diện feed Facebook/Threads/X thực tế. Chưa đánh giá chất lượng âm thanh, mọi phiên bản trình duyệt, hay nội dung vượt giới hạn Local AI hiện tại (40 đoạn, 1.200 ký tự/đoạn). Các tỷ lệ trên chỉ áp dụng cho bộ thử nghiệm này.

Bước cải thiện tiếp theo có giá trị nhất là bổ sung tập bài thực tế do người dùng gán nhãn độc lập, nhất là các từ đa nghĩa như “security”, và giữ một tập riêng để kiểm chứng sau khi chỉnh prompt/model.
