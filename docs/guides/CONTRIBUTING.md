# Bàn giao nền tảng cho 5 người

## Phần đã có

Nhóm trưởng đã dựng workspace, auth/session/role guard, danh sách/chi tiết Hub, overview, polling, schema cốt lõi, migration/seed và snapshot. Source đã lên repository public `tonnytran2511/BTL_CNPM`; commit nền tảng đã pass CI. Chưa đánh dấu task được peer review vì chưa có bằng chứng review của thành viên.

## Cách bổ sung module

1. Tạo nhánh theo task; đọc AGENTS/DESIGN và API contract.
2. Thêm module tại `apps/api/src/<module>` với controller, service, repository và DTO/model riêng.
3. Tạo migration SQL mới có số thứ tự; không sửa migration đã được áp dụng trên máy khác.
4. Response types dùng chung tại `packages/contracts`; backend enum/logic phải tồn tại ở domain/backend, không import runtime code từ package types-only.
5. Frontend thêm API method, hook, model rồi UI; component không chứa fetch hoặc quyết định phân bổ.
6. Thêm test nghiệp vụ; PR có yêu cầu, sơ đồ/thay đổi schema và kết quả kiểm tra.

Không import AppModule vào feature module. Service cần dependency giữa module phải export qua Nest module, tránh vòng phụ thuộc. AuthModule và HubsModule đã tách file trong thư mục module và export AuthService/HubsService.

Đọc `docs/business-rules.md` trước khi thêm nghiệp vụ. Kiểu DTO dự kiến ở `packages/contracts/planned.ts` phải có validation phía backend; TypeScript type không thay thế kiểm tra runtime.

MobilityModule hiện implement và export provider thật cho `ALLOCATION_PORT` tại `apps/api/src/integration/allocation.port.ts` (phần Mai Anh tuần 1, chờ review). TV2/TV4 import MobilityModule và gọi allocation trong `Database.transaction`, truyền **cùng PoolClient** qua service/repository; không mở transaction độc lập bên trong allocation. Caller sở hữu việc kiểm tra quyền, trạng thái xe và cập nhật hub_id/trip; allocation chỉ quản lý chỗ, kiểm tra Hub active và khóa Hub trước khi cấp/giải phóng. Nếu caller cần khóa xe/Hub nhiều nơi, thống nhất thứ tự Hub IDs tăng dần → xe → chỗ và retry lỗi transaction phù hợp để tránh deadlock. Không thêm provider giả trả success.

## Đầu ra riêng

| Người | Xây tiếp                                                                      | Điểm tích hợp                                                                |
| ----- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| TV2   | Reservation, trip, tìm xe phù hợp, nhận/trả/hết hạn; chống đặt trùng          | vehicles; AuthRequest.user; phối hợp parking TV3                             |
| TV3   | Private vehicle CRUD, parking reservation, charging request/session/scheduler | private_vehicles, parking_spaces, charging_points; export allocation service |
| TV4   | Hub CRUD/cấu hình, incident, redistribution và operation log                  | hubs/resources; gọi service xe/parking/charging                              |
| TV5   | Scenario, engine, metrics, recommendations, simulation history                | GET /simulation/snapshot; snapshot type mở rộng khi module mới có data       |

Mọi lệnh giữ/nhận/trả/điều chuyển cần transaction và kiểm tra trạng thái/công suất; SQL cập nhật có điều kiện hoặc lock rồi kiểm tra. Thiết kế xử lý request lặp và retry serialization/deadlock trước khi dùng ở luồng concurrent.

## Các quyết định nhóm cần review tiếp

- Đặt xe có giữ chỗ ở Hub đích hay không; trả xe khi đích đầy xử lý thế nào.
- Thời gian giữ tài nguyên và cơ chế giải phóng hết hạn.
- Thuật toán ưu tiên sạc và cách xử lý phiên gián đoạn.
- Giả định nhu cầu/thời gian của simulation; chỉ số và tiêu chí đề xuất.

Với mỗi quyết định, ghi lựa chọn, lý do, ảnh hưởng API/schema và test cần có. Không tự coi phần đang mở là đã được giảng viên hoặc cả nhóm phê duyệt.
