# Topic-aware Text Reader (Chrome Extension MVP)

Extension đọc văn bản trên bất kỳ web nào, lọc đoạn theo topic user nhập, rồi đọc bằng giọng tùy chỉnh cho từng đoạn.

## Migration status (React + TypeScript + Zustand)

Project da bat dau migrate sang stack moi:

- Vite + CRXJS cho build MV3
- React + TypeScript cho popup va results page
- Zustand cho state management popup
- Content script van giu logic cu (duoc goi qua entry TypeScript de migration an toan)
- Da tach service scan/filter sang TypeScript + unit tests
- Da nang results page React voi paging + start/stop capture + goto segment

### Thu muc legacy de review

Tat ca file implementation cu da duoc chuyen vao thu muc `legacy/`:

- `legacy/content.js`
- `legacy/manifest.json`
- `legacy/popup*.js`, `legacy/popup.html`, `legacy/popup.css`
- `legacy/results.js`, `legacy/results.html`, `legacy/results.css`

Ban co the review side-by-side giua `legacy/` va `src/`.

Lenh moi:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e:smoke`
- `npm run test:e2e:flow`

Thu muc build de load vao Chrome: `dist/`

## Cách chạy

1. Mở Chrome -> `chrome://extensions`
2. Bật `Developer mode`
3. Chọn `Load unpacked`
4. Trỏ đến thư mục dự án này
5. Mở trang web bất kỳ rồi bấm icon extension

## Tính năng hiện có

- Quét đoạn text hiển thị trên trang
- Gộp các đoạn ngắn dễ bị ngắt (hữu ích cho feed social)
- Lọc theo nhiều topic
- `Hybrid score`: keyword + semantic (embeddings)
- Mặc định chế độ dễ dùng, không cần OpenAI API key
- Chọn voice riêng cho từng đoạn trước khi đọc
- Lưu preset theo domain (topic, threshold, chế độ lọc, model, default voice)
- Auto-scan feed theo chu kỳ để bắt bài mới khi cuộn (Threads/Facebook/X)
- Theo dõi feed liên tục và lưu kết quả vào trang riêng `results.html`
- Trang kết quả có phân trang (20/50/100 dòng mỗi trang)
- Popup có 2 màn: `Cấu hình` và `Kết quả` (kết quả có phân trang ngay trong popup)
- Topic/config được tự động lưu (autosave), mở lại popup không cần chọn lại
- Mỗi item có nút `Đọc item`, click vào item để bung detail đầy đủ
- Có tùy chọn giọng `Tiếng Việt miễn phí (tự động)` không cần API
- Có nút `Tạm dừng` / `Tiếp tục` / `Dừng đọc` ngay màn kết quả

## Dùng ngay cho người mới (không cần AI)

1. Giữ `Chế độ lọc = Dễ dùng (không cần API)`
2. Chọn `Topic gợi ý nhanh` hoặc tự nhập topic
3. Bấm `Quét & Lọc` rồi bấm `Đọc`

Mẹo: ô topic hỗ trợ ngăn cách bằng `,` hoặc `;` hoặc xuống dòng.

## Dùng AI nâng cao (tuỳ chọn)

1. Chọn `Chế độ lọc = AI nâng cao`
2. Nhập `OpenAI API key`
3. Bấm `Quét & Lọc`

Nếu thiếu API key, extension tự fallback về lọc cơ bản.

## Dùng preset theo domain

- Chỉnh cấu hình theo ý muốn trên một trang (vd `threads.com`)
- Bấm `Lưu preset domain`
- Lần sau bấm `Nạp lại preset` để lấy lại nhanh cấu hình của domain đó

## Dùng auto-scan feed

1. Tick `Auto-scan feed (khi popup đang mở)`
2. Chỉnh `Chu kỳ auto-scan` (2-15 giây)
3. Cuộn feed và giữ popup mở, extension sẽ tự quét lại

Auto-scan chỉ re-score khi phát hiện feed có thay đổi, giúp giảm gọi embeddings không cần thiết.

## Luồng mới: main menu + trang kết quả riêng

1. Trong popup: nhập topic rồi bấm `Bắt đầu theo dõi feed`
2. Extension mở trang `Feed Capture Results` (riêng)
3. Quay lại tab nguồn để lướt feed
4. Mở lại tab kết quả để xem các đoạn đã lưu rõ ràng

Trang kết quả có các nút:
- `Làm mới`
- `Bật theo dõi` / `Dừng theo dõi`
- `Xóa lưu trữ`
- `Tới đoạn` để nhảy về đúng đoạn trong tab nguồn
- `Trang trước` / `Trang sau` + chọn `Số dòng/trang`

## Gợi ý cho feed social (Threads/Facebook/X)

- Cuộn trang xuống để load thêm bài trước khi quét
- Topic nên cụ thể (ví dụ: `tâm linh, luân hồi, thiền`) để lọc tốt hơn
- Xem dòng `Từ khóa trúng` dưới mỗi đoạn để kiểm tra hệ thống đã match đúng ý chưa
- Nếu giữ quá ít đoạn, giảm `Ngưỡng lọc`

## Hạn chế hiện tại

- Semantic dùng API embeddings nên tốn token
- Để giới hạn chi phí, semantic chỉ chấm tối đa 80 đoạn mỗi lần quét
- Dùng local `speechSynthesis` nên chất giọng phụ thuộc máy/browser
