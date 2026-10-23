# Smart E-Mobility Hub

## T19 — điều phối hàng chờ và phiên sạc

Nhánh: `t19/charging-scheduler`. Cập nhật ngày 23/10/2026 trên main `e918f9d`.
Phụ trách: Mai Anh.

| Công việc T19        | Chức năng trong nhánh                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xếp hàng ưu tiên     | Chờ quá lâu trước, sau đó cần xe sớm, pin thấp; ngưỡng lấy từ cấu hình DB, cùng dữ liệu có thứ tự ổn định.                                                       |
| Phân bổ cổng         | Operator chọn Hub; hệ thống cấp cổng còn trống cho yêu cầu đủ điều kiện trong cùng giao dịch dữ liệu.                                                            |
| Quản lý phiên        | Bắt đầu, hoàn tất hoặc hủy; hoàn tất cần pin quan sát đạt mục tiêu; lỗi giữa chừng hoàn tác toàn bộ.                                                             |
| Tích hợp xe thuê     | Operator tạo/hủy yêu cầu; khi giữ cổng xe chuyển sang charging, chặn đặt thuê/điều chuyển; kết thúc cập nhật pin và giải phóng xe qua service của module rental. |
| Giao diện và đồng bộ | Hai khung yêu cầu sạc cập nhật sau thao tác; lịch đỗ/yêu cầu sạc theo cột dọc có cuộn và nút Lên/Xuống.                                                          |
| Kiểm chứng           | Test PostgreSQL/HTTP cho gửi lặp, rollback và thao tác cạnh tranh; test hook cho đồng bộ, retry và đổi tài khoản. Kết quả bản cập nhật ghi tại docs/testing.md.  |

Đăng nhập operator → “Điều phối sạc” → gửi yêu cầu xe thuê hoặc chọn Hub để phân bổ → bắt đầu phiên → nhập pin thực tế khi hoàn tất/hủy.
Xe cá nhân: đăng ký → đặt chỗ → check-in đúng Hub → gửi yêu cầu sạc. Yêu cầu còn queued chưa giữ xe thuê; xe được đặt/di chuyển trước đó sẽ không được phân bổ khi không còn đủ điều kiện.

Hạn chế: chưa tự tăng pin hoặc tự chạy phân bổ theo chu kỳ; người vận hành chủ động xác nhận. Xử lý cổng hỏng, interrupted và đưa nhu cầu trở lại hàng chờ thuộc **T20**, chưa triển khai trong nhánh này. available vẫn phải đủ pin và ở Hub hoạt động mới thuê được.

## Những phần đang chạy

- Đăng nhập/đăng xuất; session lưu database; quyền sinh viên/operator kiểm tra tại backend.
- Danh sách/chi tiết Hub, xe/mức pin, chỗ đỗ và cổng sạc từ database.
- Dashboard operator và polling theo cấu hình server.
- Snapshot nhất quán chỉ đọc để TV5 xây simulation.
- Seed giả lập từ JSON; migration, kiểm thử PostgreSQL riêng và kiểu API dùng chung.

Đã tích hợp đăng ký xe cá nhân, tra cứu/đặt/hủy lịch đỗ, check-in/check-out, gửi/xem yêu cầu sạc và AllocationPort; thuê xe có tìm/đặt/hủy/nhận/trả và lịch sử. T12 có API nhật ký sự cố và tạo/start/cancel lệnh trước khi chạy; chưa có UI quản trị hoặc hoàn tất điều chuyển. Hợp đồng tại `docs/api.md`.

## Cấu trúc

```text
apps/api/src/           Nest controllers, services, repositories, auth
apps/web/src/components/ UI
apps/web/src/hooks/     state và điều phối giao diện
apps/web/src/api/       HTTP client
apps/web/src/models/    model trình bày
apps/web/src/utils/     định dạng thuần
packages/contracts/    kiểu response dùng chung
database/migrations/   schema có phiên bản
database/seed.example.json dữ liệu giả lập đầu vào
scripts/               setup, database, migration, seed
tests/                 integration test trên PostgreSQL thật
```

Đặc tả 15 use case: `docs/use-cases.md`; UML source: `docs/diagrams/`; kế hoạch 36 testcase tích hợp và traceability: `docs/integration-test-plan.md`. Kết quả chạy thực tế được ghi riêng tại `docs/testing.md`.

Chạy production cần hosting, HTTPS/cookie Secure, cấu hình DB và chiến lược vận hành riêng; compose/local hiện phục vụ phát triển. Hướng dẫn này không khẳng định hệ thống đã được triển khai production.
