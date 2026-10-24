# T20 — kiểm chứng local 23/10/2026

Nền: t19/charging-scheduler 8ee56ab trên main e918f9d đã có T18/T08/T16/T35. Nhánh mới t20/charging-failure-recovery; không sửa checkout T19/main.

## Kết quả

- npm.cmd run build: backend/frontend pass.
- npm.cmd test: 103/103 API tests và 53/53 frontend tests pass, không skip/cancel.
- npm.cmd run format:check và git diff --check: pass.
- Foundation riêng: 23/23 pass, gồm T20 và T19/T18/T35/dashboard/auth.
- PostgreSQL/HTTP dùng môi trường tạm riêng, không ghi database demo cũ.

## Phạm vi kiểm chứng T20

Auth/role/key/DTO; cổng không có phiên, scheduled và charging; pin phải không giảm và khớp session; cùng key replay/different payload conflict; không nhân đôi incident open; pin đạt mục tiêu thì fulfilled nhưng session interrupted; giữ created_at và cấp cổng khác; API incidents/resolve cũ; legacy open incident chặn cấp/bắt đầu.
Tiêm lỗi sau ghi incident hoặc resolve incident để kiểm chứng rollback toàn bộ pin/trạng thái xe thuê/request/session/point/incident/idempotency. Năm vòng allocation/failure, ba vòng completion/failure và failure/delete point kiểm tra trạng thái sau tranh chấp.
UI hook: chỉ operator, payload pin/session, retry giữ key, repair và logout trong lúc request đang chờ.

Chưa kiểm chứng thiết bị thật hoặc demo trình duyệt toàn luồng. Không phải xác nhận peer review/merge hoặc nghiệm thu sản phẩm. T20 chỉ local, chưa push GitHub.
