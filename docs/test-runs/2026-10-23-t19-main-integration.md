# T19 — ghép main e918f9d, 23/10/2026

## Phạm vi

Kế thừa T18 d4b60e0 đã có trên main, T08 nhận/trả, T15 dashboard, T16 hết hạn/chống đặt trùng và T35 quản lý Hub.
Giữ luồng T19 xe cá nhân và xe thuê, lịch sử dạng cột có cuộn, đồng bộ yêu cầu sạc giữa hai khung.
README nhánh có bảng thông tin nhiệm vụ, cách dùng, kiểm chứng và giới hạn theo yêu cầu Mai Anh.

## Tích hợp

- Giữ toàn bộ test/tài liệu hai phía, TripPanel và HubManagementPage trên App, settings mới trong seed.
- RentalChargingModule là module lá, export RentalChargingService. MobilityModule dùng module này; RentalModule vẫn dùng MobilityModule cho TripService/AllocationPort. Tránh vòng RentalModule → MobilityModule → RentalModule, không dùng forwardRef để che phụ thuộc vòng.
- SQL thuê xe vẫn nằm tại RentalRepository; thao tác giữ/giải phóng xe dùng cùng PoolClient của transaction sạc.
- Không thay migration đã chia sẻ. Không đưa T20 sự cố/interrupted vào T19.

## Kết quả local

- npm.cmd run build: backend/frontend pass.
- npm.cmd test: 102/102 API tests và 48/48 frontend tests pass, không skip/cancel.
- npm.cmd run format:check và git diff --cached --check: pass.
- Bộ chạy gồm T19 riêng tư/xe thuê, T18 cấp/xóa cổng, T08 nhận/trả, T16 concurrent/expiry scheduler, T35, auth/dashboard, operations và simulation.
- PostgreSQL/HTTP test tạm độc lập; không sửa DB demo cũ. Chưa chạy lại demo trình duyệt trên bản ghép này.

Chỉ lưu local; chưa push T19 lên GitHub hoặc merge vào main. Chờ người dùng yêu cầu publish và peer review của nhóm.
