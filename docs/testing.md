# Kiểm chứng nền tảng — 14/10/2026

## T14/T35 — kiểm chứng sau PR #13, 23/10/2026

Base main `5d0d4d2` (T35 head `ee18a06`). Build API/web và bộ test hiện có pass 82 API / 40 frontend. Bổ sung một subtest vào foundation để chạy `tests/hub-management-check.mjs` trên HTTP + PostgreSQL tạm: đủ 6 mutation routes kiểm tra 401/403, CRUD/code trùng/DTO, cấu hình giới hạn, Hub inactive, dashboard động, hold và booking tương lai chặn giảm capacity với rollback, cổng occupied, và incident/delete đồng thời. Regression đồng thời đợi lock thực qua `pg_stat_activity`, không suy luận pass từ mock hoặc sleep cố định.

Kết quả cuối và bằng chứng browser/TXT tại [execution 23/10](test-runs/2026-10-23-t14-t35.md), [bàn giao T14/T35](../demo/T14-t35-completion.md). Các mục 20/10 phía dưới là lịch sử, bao gồm phụ thuộc T35 và thiếu bằng chứng TXT đã được giải quyết trong lần này. Không xác nhận thay sinh viên về peer review/demo hoặc NFR chưa đo.

## T14 — demo tích hợp 20/10/2026

Trên nền main `435f7a0` sau PR #11, `npm test` pass **77 tests API và 28 tests frontend**; build API/web, format và kiểm tra whitespace pass. Đã demo Chrome → API → PostgreSQL cùng instance: rental, lịch đỗ/check-in/out, queue sạc, reload và simulation. T12 create/resolve incident và create/cancel redistribution được kiểm tra bằng HTTP API. Hash 13 bảng nghiệp vụ trước/sau simulation khớp. Chi tiết và giới hạn tại [bàn giao T14](../demo/T14-integrated-demo.md), [runtime evidence](../demo/evidence/T14-runtime.json).

Runner `npm run demo:t14` khởi tạo DB/credentials riêng, kiểm tra health và phục vụ UI qua proxy. Đã smoke đăng nhập và xác nhận SIGINT dừng API/DB, xóa thư mục tạm. Không thay thế kiểm thử triển khai production. T35 chưa có code/PR; TXT download chưa xác minh; chưa có peer review sinh viên, nên không kết luận full gate T14 đã pass.

## T15 — 20/10/2026

Trên nền main sau PR #9 (`c73dabe`), build frontend/backend pass; `npm test` pass **57 tests API và 23 tests frontend**. Bổ sung xác minh quyền/danh tính trước refresh, xóa cache khi bị từ chối quyền, phục hồi khi online, kiểm tra envelope và che message nội bộ 5xx. Kiểm thử PostgreSQL/HTTP thật xác nhận đặt/hủy xe qua T07 phản ánh đúng lên overview, list và detail Hub. Chi tiết phạm vi và giới hạn tại [execution log T15](test-runs/2026-10-20-t15-dashboard.md); bàn giao tuần 2 tại [báo cáo Minh Tường](reports/2026-10-20-minh-tuong-week2.md). Bổ sung browser–API–PostgreSQL riêng: đặt/hủy, polling tự cập nhật và reset khi đổi quyền pass; không có error/warn console. Chưa phải xác nhận peer review của sinh viên hoặc full T23/T25.

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

## Tích hợp 18/10/2026 — PR #7 và toàn bộ module đã ghép

Build frontend/backend pass; API 53/53 tests và frontend 18/18 tests pass. `tests/operations.test.mjs` dùng PostgreSQL riêng và HTTP thật: operator-only/validation, mô tả trắng 400, actor/thời gian, resolve/final-state guards, không đổi xe khi tạo/hủy pending, Hub/xe thay đổi sau tạo lệnh, incident mở chặn start, hai lệnh tranh cùng xe, reservation tranh với start và lỗi sau cập nhật xe rollback cả xe/order. Migration T12 chạy cùng migration parking/rental trên database sạch. Giữ toàn bộ test dashboard/auth, mobility, rental và T13.

T12 chưa có UI, hoàn tất điều chuyển, Idempotency-Key hoặc ảnh hưởng incident lên trạng thái vận hành/phiên đang chạy; đây không phải bằng chứng những luồng đó đã triển khai. Chưa chạy lại demo trình duyệt, đo tải hoặc deploy.

## Ứng viên tích hợp PR #8/T08 sau T15 — 20/10/2026

Build frontend/backend pass; full API **77/77 tests** và frontend **28/28 tests** pass; format/diff checks pass. Thêm migration 004 cho giới hạn Hub gợi ý, bảo vệ generation theo user, UI mọi chuyến active, kiểm tra Hub-first lock contention và hết hạn trong lúc chờ khóa. Browser với API/PostgreSQL riêng kiểm tra một tài khoản nhận hai xe, chọn đích chéo, trả lần lượt, lịch sử/dashboard và DB khớp; không có error/warn console trong luồng đó. Giữ regression dashboard/auth, mobility, operations và simulation.

Chi tiết tại [execution T08](test-runs/2026-10-20-t08-integration.md). Đây là ứng viên chờ review/tích hợp vào main, không phải xác nhận toàn bộ T16/T17 hoặc T23/T25 hoàn thành. PR #10/T15 đã merge trước đó.
