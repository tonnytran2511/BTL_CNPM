# Execution — nền tảng và dashboard, 15/10/2026

Phạm vi: T15 và phần chuẩn bị T29 của nhóm trưởng. Source: branch `feat/dashboard-reliability`; xác định commit chứa log này bằng `git log -- docs/test-runs/2026-10-15-foundation-dashboard.md`. Người thực thi: Codex theo chỉ dẫn nhóm trưởng; chờ thành viên review thay đổi mới.

## Môi trường và dữ liệu

macOS; Node 25.9.0, npm 11.12.1. Dependency theo package-lock.json. API integration sử dụng PostgreSQL tạm riêng, migration/seed và HTTP server thật; port/password được tạo khi chạy. Frontend dùng Vitest/jsdom và API mocks, fake timers; không phải test trình duyệt với API thật. CI Node 22 được kiểm tra riêng sau khi đẩy branch.

## Lệnh và kết quả

- `npm run build`: pass API TypeScript, frontend TypeScript và Vite production build.
- `npm test`: pass. API: 11 nhóm con và 1 parent, Node báo 12 tests; frontend: 12 tests trong 2 file.
- `npm run format:check` và `git diff --check`: pass trước commit; không thay thế test hành vi.

## Hành vi đã kiểm chứng

| Phần                   | Kết quả thực                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard polling      | Request chậm không bị gọi chồng bởi polling hoặc nút làm mới; tab ẩn không poll; quay lại tab gọi cập nhật ngay; unmount dọn timer/listener                     |
| Dashboard lỗi/phục hồi | Lỗi 503 giữ dữ liệu và thời gian thành công gần nhất; retry thành công xóa lỗi; không xóa user khi gặp lỗi server                                               |
| Session                | 401 xóa user/dữ liệu/thời gian và giải phóng trạng thái refresh; đăng nhập lại tải được; logout hủy request và bỏ qua phản hồi muộn                             |
| Chi tiết Hub           | Request chậm được hoàn tất qua nhiều poll; đổi Hub bỏ qua phản hồi cũ; đóng panel dọn loading; lỗi tạm giữ dữ liệu gần nhất và retry được                       |
| Quyền chi tiết         | 401 báo session owner; 403/404 xóa dữ liệu chi tiết cũ                                                                                                          |
| API client             | Giữ status/code/message từ backend và cookie credentials; lỗi mạng/response không phải JSON được chuẩn hóa; hủy request không bị đổi thành lỗi offline          |
| Backend quyền động     | Đổi operator thành student có hiệu lực trên session hiện có; account inactive bị từ chối login và truy cập; error 403 đúng envelope; fixture khôi phục sau test |
| Nền tảng cũ            | 10 nhóm test trước vẫn pass: config/auth/Hub/resource động/snapshot/transaction/logout/DB reconnect                                                             |

Test mới nằm trong `apps/web/src/hooks/dashboard.test.ts`, `apps/web/src/api/client.test.ts`; backend bổ sung trong `tests/foundation.test.mjs`.

## Giới hạn và liên kết test plan

Đây là regression test nền tảng, không phải kết quả chạy đủ 36 case trong `docs/integration-test-plan.md` (tài liệu ở PR #1). IT-01/02/03/04 có bằng chứng cho các điều kiện được fixture hiện tại kiểm tra; chưa đánh dấu pass toàn bộ các case nhiều điều kiện. IT-05 mới có kiểm tra riêng phía hooks và biến đổi dữ liệu API; đã smoke-test Chrome với API local thật: mở dashboard operator, mở chi tiết Hub và làm mới vẫn giữ panel/dữ liệu. Các nhánh mất mạng/phục hồi/401 mới được kiểm tra bằng hooks/API tests, chưa chạy toàn bộ IT-05 bằng trình duyệt. IT-06 hết hạn reservation và IT-07 trở đi phụ thuộc module thành viên, chưa chạy.

Chưa đo tải/latency, chưa chạy test trên deployment, chưa demo xuyên module, chưa review fix của thành viên. T15/T29 chưa đủ điều kiện đánh dấu hoàn thành toàn bộ.

## Lần chạy mở rộng — deadline và bảo mật session

Cùng ngày/môi trường, tiếp tục trên branch `feat/dashboard-reliability`:

- `npm run build`: pass API/web.
- `npm test`: **13 nhóm API con + 1 parent (14 tests)** pass trên PostgreSQL/HTTP thật; **16 tests frontend** pass trong 3 file.
- Thêm kiểm tra API: session rotation vô hiệu token cũ, DB chỉ có SHA-256 của token, cookie HttpOnly/SameSite/Path/Max-Age; một API instance riêng với cookie Secure và giới hạn 2 lượt login, lượt thứ ba 429 và không tạo thêm session. Instance này dừng trong cleanup; không đổi cấu hình API vận hành.
- Thêm kiểm tra frontend: request mutation treo bị hủy đúng deadline mà không tự replay; deadline áp dụng cả khi đọc body; caller cancellation dọn timer; hook dùng API client thật phục hồi sau timeout. Fetch được mô phỏng trong các test này.
- Chrome + API local thật: dùng tab kiểm thử riêng, tạm đặt offline bằng CDP. Làm mới hiển thị lỗi, giữ số liệu/thời gian trước đó và panel Hub. Khôi phục online rồi làm mới: lỗi biến mất, timestamp tăng, vẫn đúng user/panel. Mạng được trả lại bình thường sau kiểm thử.

Các bằng chứng trên mở rộng nhánh lỗi/phục hồi của IT-05 và bảo mật IT-01/02/03; không tự đánh dấu hoàn thành các case tổng hợp hoặc module chưa có code.

Chrome kiểm tra thêm deadline thật: tạm giữ riêng request `/api/network/overview`, không giữ Document navigation. Sau deadline cấu hình, UI báo “Máy chủ phản hồi quá lâu”, giữ số liệu cũ và bật lại nút Làm mới. Gỡ rule, giải phóng request còn giữ và làm mới: lỗi biến mất, timestamp tăng, nút trở lại bình thường. Network emulation và interception đã được gỡ. Một thử nghiệm latency trên toàn tab trước đó bị gián đoạn do trang reload khi Vite config đổi, không dùng lần đó làm bằng chứng timeout.
