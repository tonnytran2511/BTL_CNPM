# Kiểm chứng nền tảng — 14/10/2026

## Bản ứng viên tuần 2/leader tuần 3 — 28/10/2026

Cài mới candidate trong thư mục sạch cùng host qua `npm run verify:delivery`: npm ci/setup:env/format/build pass, 130 backend + 62 frontend pass, 0 fail. Bổ sung ba regression T23/T29 và Chrome smoke thuê/trả/dispatch/ba kịch bản/history. Execution và lịch sử verifier fail/retest tại [28/10 release](test-runs/2026-10-28-release.md), coverage có giới hạn tại [traceability](test-runs/2026-10-28-traceability.md). Không cộng số các lần chạy hoặc nhận là toàn bộ biến thể 36 IT đã pass. Bằng chứng tải TXT còn cần xác minh; video final, rehearsal/máy khác/nộp bài chưa có xác nhận.

## T22/T36 — 25/10/2026, local chờ review

Build frontend/backend pass; 113 backend + 62 frontend tests pass. Ba kịch bản/history/retry/role/DTO và snapshot không ghi vận hành được kiểm tra trên PostgreSQL/HTTP riêng. T36 kiểm tra 60 seeds × 3 kinds, bất biến, wait/utilization tính tay và recommendation theo tài nguyên. Regression frontend bảo vệ key retry, session cũ, clear, saved params/report và history race. Chi tiết/giới hạn tại [execution T22/T36](test-runs/2026-10-25-t22-t36.md); chưa xác minh walkthrough trình duyệt, chưa peer review/commit/push phần mới. Các giả định baseline tại [scenarios.md](scenarios.md).

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

## T18 trên nền main tích hợp — 20/10/2026

Worktree T18 trong folder BTL_CNPM-main (2) bắt đầu từ main c73dabe. npm test pass: **54 API tests** (Node bao gồm các parent/subtests) và **18 frontend tests** (4 Vitest files). Các suite chạy cả foundation/mobility, T18 allocation, rental search/reservation, operations và simulation; PostgreSQL/HTTP test thực dùng database tạm riêng, không database vận hành.

T18 kiểm tra tranh chỗ/cổng, trùng lịch theo xe và theo chỗ, gửi lại cùng key, hold còn/hết hạn, xe quá giờ, request không giữ hai point, point failed/sai Hub, actor sai quyền, xe rời Hub, rollback sau lỗi và allocation/check-out đồng thời. Xem tests/allocation-safety-check.mjs và docs/allocation-safety.md. Không coi các test này là bằng chứng module xe thuê đã có tích hợp charging, T08 đã merge hoặc đã nghiệm thu toàn bộ tuần 2.

Bản T18 cũ trên nền tuần 1 pass 17 tests; đó không phải số test của nền tích hợp. T19/T20 chưa triển khai. Phần mới chưa có peer review/merge hoặc kiểm chứng production.

## T18 cập nhật main — 23/10/2026

Ghép main a80ca54, giữ cả test/tài liệu T18 và T08/T35. Build pass; npm test **84 API + 40 frontend** pass; format/diff check pass. Thêm 5 vòng phân bổ/xóa cổng đồng thời. Chi tiết tại [execution T18](test-runs/2026-10-23-t18-main-integration.md). Chỉ local, chưa push/merge theo yêu cầu Mai Anh.

## T17 — xử lý lỗi thuê xe và Idempotency-Key (22/10/2026)

`tests/rental-hardening.test.mjs` (PostgreSQL thật, 12 case): nhận xe bị từ chối khi pin giảm dưới ngưỡng, khi xe có sự cố mở, khi Hub nguồn inactive (dữ liệu không đổi, nhận lại được sau khi hết lỗi); trả xe vào Hub đầy giữ trip active và gợi ý Hub khác; Idempotency-Key cho đặt/hủy/nhận/trả (cùng key trả kết quả cũ, khác payload 409, key quá dài 400, key theo người dùng, 8 request song song cùng key chỉ tạo một reservation, nhận/trả lặp và song song chỉ một trip/một chỗ đỗ, request lỗi không đốt key). Chưa kiểm tra telemetry/hao pin trong chuyến và chưa có idempotency cho module đỗ/sạc ngoài cơ chế riêng của T11.

## T19

`npm.cmd test` đã pass 59 kiểm thử backend và 18 frontend. Bổ sung kiểm thử thứ tự ưu tiên và luồng sạc với PostgreSQL/HTTP độc lập, gồm gửi lặp và hoàn tất/hủy đồng thời. Xem [bàn giao T19](charging-scheduler.md); chưa kiểm tra trực quan thủ công màn hình mới.

## 20/10/2026 — T19 tích hợp sạc xe thuê

- `npm.cmd run build` và `npm.cmd run format:check`: pass.
- `npm.cmd run test:web`: 22/22 pass (5 file); gồm 4 kiểm thử hook quản lý sạc mới.
- Backend chạy tuần tự bằng Node test runner với `--test-concurrency=1`, toàn bộ 8 file *.test.mjs. Tổng 60 test: 59 pass, 1 suite T07 báo EBUSY khi Windows dọn folder PostgreSQL tạm; mọi assertion chức năng trong suite đó pass. Chạy lại `node --test tests/reservation.test.mjs`: 11/11 pass, cleanup thành công. Kết quả các bộ đạt sau lần chạy lại này, không phải một lần tổng 60/60.
- Foundation riêng: 19/19 pass, bao gồm sạc xe thuê và cạnh tranh với đặt thuê/điều chuyển.
- Fixture riêng tạo rồi xóa dữ liệu trên PostgreSQL tạm; không dùng database demo T19 đang chạy.
- Kiểm thử lỗi chèn session và lỗi sau cập nhật pin đều xác nhận rollback. Gửi lại sau rollback dùng cùng key thực thi thành công.
- Web localhost:5119 và proxy /api/health trả HTTP 200 sau build. Chưa xác minh trực quan thủ công toàn màn hình mới.

T19 không còn chờ hợp đồng sạc xe thuê từ Duy Tân; đã có RentalChargingService nhận cùng PoolClient. T20 sự cố/interrupted vẫn chưa triển khai.

## 20/10/2026 — đồng bộ hai khung yêu cầu sạc

Khắc phục yêu cầu xe thuê tạo ở Điều phối sạc chưa hiện ngay tại danh sách Yêu cầu sạc phía trên; chiều ngược lại và đổi trạng thái phiên cũng tải lại cả hai khung theo lần cập nhật dữ liệu chung. Không reset bước nhập và không để response cũ ghi đè danh sách mới.
Thêm 4 kiểm thử hồi quy hook cho đồng bộ hai chiều, đổi trạng thái và response chậm. `npm.cmd run test:web`: 26/26 pass; frontend build và kiểm tra định dạng được xác minh riêng. Backend/API không đổi.

## T19 cập nhật main e918f9d — 23/10/2026

Build và format/diff check pass; npm test **102/102 backend + 48/48 frontend pass**. Giữ T08/T16/T35 và T18 đã merge. Chi tiết [execution T19](test-runs/2026-10-23-t19-main-integration.md). Chưa demo trực quan lại bản ghép, chưa push T19.

## T19 kiểm chứng ở checkout mới — 23/10/2026

Giữ nguyên bản T19 và README Mai Anh đã chỉnh trên nền main e918f9d. Build/format pass. Lần chạy tổng backend có 101 pass và một suite lỗi EBUSY khi Windows dọn thư mục PostgreSQL tạm; không có assertion nghiệp vụ thất bại. Bổ sung maxRetries=10, retryDelay=100ms vào bước rm thư mục test T16 để xử lý khóa file tạm có giới hạn. Chạy lại riêng reservation-expiry.test.mjs: 12/12 pass; frontend: 48/48 pass. Các bộ backend đạt sau lần chạy lại, không mô tả thành một lần chạy tổng 102/102 mới. Không đổi nghiệp vụ hoặc schema; không thay chỉnh sửa README của Mai Anh.

## T20 — 23/10/2026

Build pass; npm test **103/103 API + 53/53 frontend pass**; format/diff checks pass. Có kiểm thử gián đoạn/requeue/repair, API incidents cũ, replay, rollback và fail/allocate/complete/delete đồng thời. Chi tiết [execution T20](test-runs/2026-10-23-t20-failure-recovery.md). Chỉ local, chưa push/merge; chưa demo trình duyệt toàn luồng.

## PR #17 — tích hợp T21/T37 ngày 24/10/2026

Bản ghép nhánh Quỳnh Anh với main `0f1a10a` đã chạy `npm run build`, `npm run format:check` và `npm test`: 105 backend + 56 frontend tests pass. Regression bổ sung xác minh create/resolve sự cố cổng T20 ghi log T37 đúng actor, chỉ một lần kể cả request bị từ chối; khóa Hub điều chuyển không chặn KEY SHARE của reservation. Bộ operations cũng kiểm tra hoàn tất/rollback khi đích đầy và cạnh tranh thuê/điều chuyển. Chưa demo trình duyệt hoặc xác nhận nghiệm thu của thành viên; cập nhật PR không đồng nghĩa đã merge.

## T17/T22/T36 — bản tích hợp 27/10/2026

PR #16 đã tích hợp thành main `de65b75`; PR #18 ghép main đó và chuyển truy vấn thời gian snapshot từ HubsService xuống HubsRepository. `npm run format:check`, `npm run build`, `npm test` pass trên bản ghép: 126 backend + 62 frontend tests. Bao gồm hardening/idempotency thuê xe, ba kịch bản và 60 seed cho bất biến mô hình, snapshot không đổi dữ liệu vận hành, lịch sử/replay/pagination và đồng bộ UI. Hai migration `007_rental_idempotency.sql` và `007_simulation_runs.sql` cùng chạy được vì migration runner dùng toàn bộ tên file. Chưa xác nhận demo/nghiệm thu nhóm, kiểm thử chéo đủ năm thành viên hoặc đóng băng chức năng. Giới hạn mô hình tại docs/scenarios.md; web T17 chưa giữ key khi thử lại sau timeout.
