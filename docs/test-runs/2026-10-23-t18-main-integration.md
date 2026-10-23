# T18 — cập nhật main ngày 23/10/2026

## Nền và phạm vi

Nhánh t18/parking-allocation-safety trước cập nhật ở f5d3091, thiếu 18 commit so với main a80ca54 (đã gồm T08/T15/T35 và kiểm chứng T14).
Folder người dùng cung cấp BTL_CNPM-main (3))/BTL_CNPM-main khớp toàn bộ 184 file được Git quản lý của main a80ca54.
Ghép main vào T18 bằng merge để giữ lịch sử và tác giả hai phía; không rebase, không force push, không đưa code T19/T20 vào T18.

## Giải quyết xung đột

- tests/foundation.test.mjs giữ cả kiểm thử T18 allocation và T14/T35 Hub management, cùng các kiểm thử dashboard/auth hiện có.
- docs/ai-usage.md, api.md, guides/DESIGN.md, testing.md giữ nội dung của cả T18 và main, các kết quả cũ giữ như lịch sử.
- Mã ứng dụng ghép tự động; không cần đổi hợp đồng T18 để chạy trên main mới.
- Bổ sung 5 vòng cấp cổng đồng thời với xóa cổng qua HubManagementService: đúng một thao tác thành công; nếu phân bổ thắng thì cổng occupied và có một session/request allocated; nếu xóa thắng thì không còn cổng/session và request vẫn queued.

## Kết quả chạy local

- npm.cmd run build: backend/frontend pass.
- npm.cmd test: 84/84 API tests và 40/40 frontend tests pass, không skip/cancel.
- npm.cmd run format:check và git diff --check: pass.
- Có T18, T08 pickup/return, T35 CRUD/incident race, rental/operations, auth/dashboard và simulation trong bộ chạy.
- Database/HTTP test dùng môi trường tạm riêng; không khởi động hay sửa DB demo của người dùng.

Chưa demo trực quan lại giao diện. Kết quả local không thay peer review của nhóm. Theo yêu cầu Mai Anh, chưa đẩy lần cập nhật này lên GitHub và chưa merge vào main.
