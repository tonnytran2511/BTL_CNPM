# Kiểm chứng nền tảng — 14/10/2026

## Cập nhật Mai Anh — 15/10/2026

Code T09–T11 được bổ sung trực tiếp vào folder dự án gốc; chưa commit/push hoặc có peer review.

- API TypeScript build: pass trên Node 24.19.0.
- Frontend TypeScript và Vite production build: pass.
- `node --test tests/mobility-unit.test.mjs`: 4/4 nhóm pass; gồm nested DTO/timezone/owner spoof, thời lượng/quyền/sức chứa, điều kiện yêu cầu sạc và cùng client transaction của allocation. Đây là unit test với repository thay thế, không chứng minh SQL/concurrency thực.
- Test tích hợp mới `tests/mobility-check.mjs` đã nối vào foundation suite, nhưng **chưa xác minh pass**. PostgreSQL mặc định trên Windows ban đầu dùng WIN1252 khiến seed tiếng Việt lỗi; đã thêm `initdbFlags: ["--encoding=UTF8"]` ở local DB và test. Lần chạy trong sandbox sau đó bị chặn kết nối loopback (EACCES); suite timeout trước khi kiểm chứng các ca nghiệp vụ. Lần chạy ngoài sandbox chưa được cấp quyền sau bản sửa UTF-8. Không dùng kết quả nền tảng 14/10 làm bằng chứng test phần Mai Anh.
- Chưa demo trình duyệt/kiểm chứng reload và dữ liệu thật cho phần mới. Cần chạy lại full suite và demo trên môi trường cho phép PostgreSQL/HTTP localhost, review/tích hợp cùng Duy Tân trước khi đánh dấu Hoàn thành.

Các nội dung dưới đây là bằng chứng **lịch sử nền tảng 14/10**, không phải kết quả của bản T09–T11 ngày 15/10.

## Bằng chứng nền tảng trước khi bổ sung mobility

Môi trường kiểm chứng: Node 25.9.0, npm 11.12.1; NestJS 11; Vite 8.3.4; PostgreSQL local qua embedded-postgres. Phiên bản dependency chính xác trong package-lock.json. CI dùng Node 22.

`npm run build`: API TypeScript và frontend TypeScript/Vite pass.

`npm test`: 10 nhóm integration test pass, gồm 1 parent test (Node báo tổng 11 tests). Test dùng PostgreSQL riêng và HTTP server thật, không mock database.

| Nhóm                      | Yêu cầu liên quan      | Kiểm tra                                                             |
| ------------------------- | ---------------------- | -------------------------------------------------------------------- |
| Config / protected routes | FR-01, FR-13           | Config từ env; thiếu session bị từ chối                              |
| Credentials / DTO         | FR-13                  | Sai mật khẩu, DTO sai, client gán role                               |
| Authorization             | FR-13                  | Sinh viên không gọi được overview/snapshot; không lộ hash/token      |
| Hub resource counts       | FR-01                  | Migration/seed chạy lại không trùng; chi tiết đúng số lượng; 400/404 |
| Dynamic state             | FR-01                  | DB thay trạng thái xe/ngưỡng pin thì response thay theo              |
| Edge conditions           | FR-01                  | Hub inactive, hold hết hạn, Hub không có tài nguyên                  |
| Snapshot / constraints    | NFR-06, nền tảng FR-11 | Snapshot không sửa vận hành; pin ngoài biên bị database từ chối      |
| Logout / Origin           | FR-13                  | Cross-origin mutation bị chặn; logout revoke; session hết hạn        |

Nhóm kiểm tra bổ sung: transaction dùng chung commit thành công, rollback giữ nguyên dữ liệu và snapshot chặn ghi; đóng idle connection của API từ PostgreSQL, tiến trình API vẫn sống và truy vấn tiếp theo phục hồi kết nối. Script PostgreSQL local cũng đã được kiểm tra dừng/mở lại với dữ liệu giữ nguyên.

Snapshot test không chứng minh simulation engine hoàn chỉnh hoặc dự báo chính xác. Chưa có test reservation conflict vì module reservation chưa có code.

Kiểm tra Chrome thủ công: đăng nhập operator, dashboard hiển thị dữ liệu DB, mở chi tiết Hub và reload vẫn giữ session; đăng xuất quay về login; đăng nhập sinh viên hiển thị đúng vai trò và các Hub. Khi dev server khởi động lại, client xử lý response rỗng bằng thông báo kết nối thay vì lỗi JSON thô.

## Chưa kiểm chứng

CI trên Ubuntu/Node 22 cho commit nền tảng `2f22bef` đã pass toàn bộ bước npm ci, setup env, format, build và test: https://github.com/tonnytran2511/BTL_CNPM/actions/runs/38594291555. Đây là lần setup từ checkout sạch trên runner, không dùng node_modules hoặc database local của nhóm trưởng.

Docker daemon không chạy trên máy tại thời điểm thực hiện; đã dùng PostgreSQL local thay thế. Chưa đo tải/latency mục tiêu, chưa kiểm tra deploy production hoặc các module TV2–TV5.

## Bổ sung 15/10/2026 — T15/T29

`npm test` hiện chạy cả API và frontend. Lần chạy mới pass 11 nhóm API với PostgreSQL/HTTP thật (Node đếm 12 tests bao gồm parent) và 12 test frontend với Vitest/jsdom/API mocks. Frontend kiểm tra polling, tránh request chồng, lỗi/phục hồi, phiên hết hạn, phản hồi cũ và retry chi tiết Hub. API thêm kiểm tra thay đổi quyền/active trên session hiện có. Build pass.

Execution chi tiết và giới hạn: [test-runs/2026-10-15-foundation-dashboard.md](test-runs/2026-10-15-foundation-dashboard.md). Test frontend không thay thế kiểm thử toàn luồng trình duyệt–API–DB; 36 case tích hợp vẫn chưa chạy đủ.

Lần mở rộng cùng ngày: API **13 nhóm con + 1 parent = 14 tests**, frontend **16 tests** pass. Bổ sung deadline request/body, recovery qua API client thật trong jsdom; session rotation/token hash/cookie và login rate limit trên API instance riêng. Chrome đã kiểm tra mất mạng/online phục hồi bằng network emulation riêng cho tab. Xem execution log ở trên.

## T13 — 17/10/2026

Build frontend/backend pass; npm test: 31 test pass, gồm T13 engine và HTTP trên PostgreSQL tạm. Kiểm tra reproducibility, số liệu từ timeline, conservation, pin/trạng thái, invalid inputs, operator-only và bảng vận hành không đổi. npm run format:check pass. Chưa kiểm chứng UI trong trình duyệt; chờ Minh Khuê demo/peer review. Xem simulation.md.

## Tích hợp 18/10/2026 — PR #2 sau T13

Checkout tích hợp giữ dashboard deadline/session, mobility, rental search và simulation. Build frontend/backend pass; API 34/34 tests và frontend 16/16 tests pass. Bộ chạy API tìm toàn bộ file `tests/*.test.mjs` qua Node để tránh bỏ sót suite và không phụ thuộc shell glob trên Windows. Chưa chạy lại demo trình duyệt trong lần tích hợp này.

## Tích hợp 18/10/2026 — PR #6

Build frontend/backend pass; API 45/45 tests và frontend 18/18 tests pass trên bản gồm dashboard, mobility, T13 và T07. Sửa trùng formatDateTime khi auto-merge; chuyển điều phối đặt/hủy và xác nhận hủy sang hooks. Regression frontend kiểm tra phản hồi mutation của tài khoản cũ không khóa/ghi lỗi vào phiên mới, chống submit đồng thời và đọc lại dữ liệu sau xung đột. Chưa demo trình duyệt trong lần này; T08/T16 và Idempotency-Key của rental vẫn ngoài phạm vi T07.
