# Kiểm chứng nền tảng — 14/10/2026

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
