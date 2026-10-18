# Kế hoạch kiểm thử tích hợp v1 — 15/10/2026

Trạng thái: **kế hoạch**, chưa phải kết quả chạy 36 case dưới đây. Kết quả kiểm chứng code nền tảng thực tế nằm trong [testing.md](testing.md). Không đánh dấu pass từ việc đọc spec hoặc từ test của một luồng tương tự.

## Mục tiêu và phạm vi

Kiểm chứng yêu cầu → use case → business rules → API/service → database → UI. Tập trung quyền, trạng thái, tài nguyên dùng chung, transaction/rollback, sự cố và simulation. Leader quản lý test xuyên module; owner sửa lỗi; người kiểm thử chéo xác nhận lại.

Bao gồm auth/Hub/dashboard và các nghiệp vụ TV2–TV5 sau khi có code. Loại trừ thanh toán, IoT thật, bản đồ 3D và production deployment vì chưa thuộc phạm vi bản này. Không coi integration test hiện có là bằng chứng cho module chưa triển khai.

## Môi trường và dữ liệu

- Build từ commit ghi trong execution log; Node/npm/PostgreSQL theo lockfile và môi trường được ghi rõ. Database test riêng, không dùng DATABASE_URL vận hành.
- Dùng user aliases `studentA`, `studentB`, `operatorA`, `inactiveUser`; lấy ID qua seed/query test, không hardcode UUID hoặc password vào test/source.
- Resource aliases `sourceHub`, `targetHub`, `fullHub`, `inactiveHub`, `emptyHub`, `availableVehicle`, `lowBatteryVehicle`, `reservedVehicle`, `failedPoint`. Đây là fixture test dự kiến, **không phải tài nguyên đã có trong seed.example.json**.
- Mỗi case ghi policy/cấu hình đang áp dụng; tạo dữ liệu theo quan hệ và trạng thái cần thử. Khôi phục fixture hoặc tạo schema/DB mới giữa case; kết quả không phụ thuộc thứ tự chạy.
- Đồng hồ/seed điều khiển được ở test để kiểm tra đúng biên expiresAt và reproducibility. Không dùng sleep ngẫu nhiên để ép kết quả cuộc đua.
- Concurrency test dùng barrier cho hai request bắt đầu cùng điều kiện; kiểm tra cả responses và dữ liệu sau commit. Ghi mức isolation/lock/retry được sử dụng; kết quả một lần không chứng minh hết mọi interleaving.
- Failure injection chỉ trong test: ném lỗi tại boundary allocation/persistence để kiểm tra rollback. Không tạo endpoint public để gây lỗi.

## Mức kiểm thử và kỹ thuật

Unit cho hàm thuần/engine/priority; integration cho service–repository–DB và API thật; browser/system cho UI–API–DB. Áp dụng equivalence partitioning, boundary-value, decision-table, state-transition, yêu cầu/use-case và concurrency testing theo cột kỹ thuật dưới đây.

## Entry / exit criteria

Entry mỗi case: code/contract/migration của module liên quan đã có; setup và seed test chạy được; owner xác nhận BR còn tranh luận đã chốt; có phiên bản dữ liệu/cấu hình và môi trường.

Exit mốc 26/10: các luồng cơ bản và quyền chạy trên cùng bản tích hợp; các case chưa có chức năng ghi blocked/not run và có người phụ trách. Không ép case chưa có code thành pass.

Exit mốc 02/11: đủ phạm vi chức năng; case trọng yếu về cấp trùng, capacity, sai quyền, state, rollback và simulation được thực thi; defect có severity/status và người sửa.

Exit trước 08/11: không lỗi làm sai/mất dữ liệu, vượt quyền hoặc chặn luồng chính; các case bắt buộc pass hoặc phần cắt giảm được công khai trong báo cáo; setup trên máy khác, demo quay sẵn và traceability đầy đủ. Giới hạn hiệu năng chưa đạt phải được ghi riêng.

## Các case (đều chưa chạy theo đặc tả này)

| ID / ưu tiên | UC / FR / BR                | Chuẩn bị                                                                | Bước thực hiện                                                                                | Kết quả mong đợi / invariant                                                                                                  | Kỹ thuật                   | Owner / kiểm thử chéo    |
| ------------ | --------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------ |
| IT-01 / P0   | UC-01; FR-13                | User active của hai role, không có session                              | Login từng role; GET me; reload UI                                                            | User đúng role; cookie HttpOnly; không trả hash/token; reload vẫn đăng nhập                                                   | Use-case, partition        | Leader / TV4             |
| IT-02 / P0   | UC-01; FR-13; BR-12         | Password sai, inactiveUser, DTO sai, student session                    | Thử login các dữ liệu sai; gửi role=operator; student gọi overview/snapshot                   | DTO 400, auth 401, trái quyền 403; không tạo session hoặc cấp quyền                                                           | Decision table             | Leader / TV2             |
| IT-03 / P0   | UC-01; FR-13                | Session còn hạn; mốc hết hạn điều khiển được                            | Logout rồi dùng token cũ; thử session trước/đúng/sau expiresAt; mutation sai Origin           | Token logout/hết hạn bị từ chối; mutation trái Origin không đổi DB                                                            | Boundary, state            | Leader / TV3             |
| IT-04 / P1   | UC-02/11; FR-01             | Hub active/inactive/empty; tài nguyên biết trước                        | Đọc list/detail/overview cho hai role; ID sai và không tồn tại                                | Sinh viên không thấy inactive; count đúng DB; empty không lỗi chia 0; 400/404 đúng contract                                   | Partition, integration     | Leader / TV5             |
| IT-05 / P1   | UC-02/11; FR-01             | Dashboard đang có dữ liệu                                               | Thay tài nguyên qua service hợp lệ; refresh/poll; làm API gián đoạn; phục hồi                 | Số liệu đổi theo DB; lỗi không giả như vừa cập nhật; retry phục hồi, session không tự mất vì 500                              | System, fault              | Leader / TV4             |
| IT-06 / P1   | UC-03; FR-02                | Ngưỡng pin T trong cấu hình; xe T-1/T/T+1 và các status                 | Tìm theo Hub/type; thay ngưỡng rồi tìm lại                                                    | Chỉ xe đủ điều kiện theo rule pin đã chốt; bộ lọc sai bị từ chối; không giữ xe khi chỉ tìm                                    | Boundary, partition        | TV2 / TV5                |
| IT-07 / P0   | UC-04; FR-03; BR-01         | availableVehicle ở sourceHub active                                     | studentA đặt; studentB đặt sau                                                                | Một reservation active và xe reserved; yêu cầu sau xung đột; không giữ chỗ đích                                               | State, integration         | TV2 / TV4                |
| IT-08 / P0   | UC-04; FR-03; BR-01         | Hai user cùng nhắm một xe available                                     | Dùng barrier gửi hai yêu cầu đặt đồng thời; truy vấn kết quả                                  | Đúng một yêu cầu thắng; một quyền giữ xe; không orphan reservation                                                            | Concurrency                | TV2 / Leader             |
| IT-09 / P1   | UC-04; FR-03; BR-01/11      | Reservation active; reservation của người khác                          | Chủ hủy; người khác hủy; lặp hủy; hủy sau fulfilled                                           | Hủy hợp lệ giải phóng xe; sai quyền bị chặn; không đưa xe in_use về available                                                 | State, decision            | TV2 / TV3                |
| IT-10 / P0   | UC-04/05; FR-03/04          | Reservation với expiresAt xác định                                      | Nhận trước, đúng, sau thời điểm hết hạn; thử khi cleanup chưa chạy                            | Nhận chỉ trước hạn; đúng/sau hạn bị từ chối dù scheduler chưa cleanup; tài nguyên hết hạn được xử lý đúng                     | Boundary, state            | TV2 / TV4                |
| IT-11 / P0   | UC-05; FR-04; BR-02         | Reservation active và chỗ nguồn có xe                                   | Nhận xe; đọc trip/reservation/vehicle/parking/dashboard                                       | Một trip active; reservation fulfilled; xe in_use; chỗ nguồn free cùng commit                                                 | Integration                | TV2 + TV3 / Leader       |
| IT-12 / P0   | UC-05; FR-04; BR-02         | Như IT-11; hook gây lỗi sau một update                                  | Nhận xe, gây lỗi tại allocation/persistence                                                   | Không có trip mới; reservation/xe/chỗ giữ trạng thái trước transaction                                                        | Fault, structural          | TV2 + TV3 / Leader       |
| IT-13 / P0   | UC-06; FR-04; BR-03         | Trip active, targetHub có chỗ                                           | Trả xe; đọc toàn bộ entity và dashboard nguồn/đích                                            | Trip completed; xe ở đúng đích/đúng một chỗ; trạng thái pin/xe theo rule đã chốt                                              | Integration                | TV2 + TV3 / TV4          |
| IT-14 / P0   | UC-06; FR-04; BR-03         | Trip active; fullHub không có chỗ                                       | Trả tại fullHub; xem gợi ý và thử đích còn chỗ                                                | Lần đầu 409, trip vẫn active, không đổi vị trí; lần sau trả được; không hứa giữ chỗ từ gợi ý                                  | Boundary, alternate        | TV2 + TV3 / TV5          |
| IT-15 / P0   | UC-06; FR-04; BR-03         | Hai trip active; đích còn đúng một chỗ                                  | Gửi hai lệnh trả đồng thời                                                                    | Một thành công; một trip còn active; capacity không vượt; không hai xe chung chỗ                                              | Concurrency                | TV2 + TV3 / Leader       |
| IT-16 / P0   | UC-05/06; FR-04; BR-11      | Luồng nhận/trả có key và payload xác định                               | Gửi lặp cùng key/payload; cùng key/payload khác; cùng key từ user khác                        | Không thêm trip/chỗ; kết quả cũ được trả đúng; payload khác 409; phạm vi key tách actor                                       | Decision table             | TV2 / TV3                |
| IT-17 / P1   | UC-07; FR-05                | studentA/studentB                                                       | Đăng ký xe; đăng ký trùng; client gán ownerB                                                  | Owner lấy từ session; trùng bị chặn; không tự chiếm parking/charging                                                          | Partition, security        | TV3 / TV2                |
| IT-18 / P1   | UC-08; FR-05; BR-04/12      | Slot [a,b) có booking; duration limit D                                 | Đặt [b,c), slot trùng; starts=ends/starts>ends; duration D-1/D/D+1; đổi timezone cùng instant | Tiếp giáp hợp lệ; overlap bị chặn; khoảng sai/ngoài limit bị chặn; UTC nhất quán                                              | Boundary, partition        | TV3 / TV5                |
| IT-19 / P0   | UC-08; FR-05; BR-04         | Một slot tài nguyên còn lại cùng khoảng; hai user                       | Đặt cùng slot đồng thời                                                                       | Chỉ một booking hợp lệ; không vượt capacity trong khoảng                                                                      | Concurrency                | TV3 / Leader             |
| IT-20 / P1   | UC-08/11; FR-05/01; BR-05   | Booking ngày sau, chỗ hiện đang free                                    | Đặt tương lai; đọc dashboard hiện tại; check-in đúng điều kiện; check-out                     | Tương lai không chiếm chỗ hôm nay; check-in occupied đúng xe; check-out giải phóng một lần                                    | State, integration         | TV3 / TV4                |
| IT-21 / P0   | UC-08; FR-05                | Booking của A; người B; booking đang sử dụng                            | Thử hủy/check-in/out sai chủ; lặp check-out; hủy sau đã chiếm                                 | Không thao tác tài nguyên người khác; không free chỗ của xe khác hoặc giảm occupancy hai lần                                  | Decision, state            | TV3 / TV2                |
| IT-22 / P1   | UC-09; FR-06; BR-06         | Xe cá nhân của A; xe thuê; pin C                                        | A gửi request cá nhân; operator request xe thuê; target C/C+1/100/101                         | Chỉ target hợp lệ và đúng quyền được queued; không tự charging khi chưa allocation                                            | Boundary, partition        | TV3 / TV5                |
| IT-23 / P0   | UC-09; FR-06; BR-06         | Xe của A; userB; point bận/failed                                       | UserB request xe A; request khi point không sẵn sàng                                          | Sai quyền 403; không cấp failed point; queue/rejection theo policy đã chốt, không báo charging giả                            | Decision, security         | TV3 / TV4                |
| IT-24 / P1   | UC-10; FR-07; BR-07         | Queue urgent/lowBattery/aged/normal; các ngưỡng từ policy               | Phân bổ theo policy; đổi ngưỡng; thử các trường hợp bằng điểm/thời hạn                        | Order đúng baseline; aged FIFO; tie-break ổn định; ngưỡng động                                                                | Decision table             | TV3 / TV5                |
| IT-25 / P0   | UC-10; FR-06/07             | Một point available; nhiều request queued                               | Hai allocator cùng chạy; tiến hành start/complete và gửi lặp complete                         | Một session charging/point/request; complete đạt mục tiêu và free point một lần                                               | Concurrency, state         | TV3 / Leader             |
| IT-26 / P0   | UC-10/13; FR-06/09; BR-08   | Session charging chưa đạt mục tiêu                                      | Báo point failure; đọc session/request/point; allocator chạy tiếp                             | interrupted; pin đã đạt giữ; phần còn lại queued; point failed không nhận việc; không completed giả                           | Fault, integration         | TV3 + TV4 / TV2          |
| IT-27 / P1   | UC-11; FR-01                | Operator/student; dashboard hoạt động                                   | Gọi overview trái quyền; cập nhật Hub active/inactive; thử mất kết nối                        | Quyền server đúng; available không tính inactive; UI không che dữ liệu stale                                                  | System, security           | Leader / TV5             |
| IT-28 / P0   | UC-12; FR-08                | Hub có xe/chỗ/booking đang dùng                                         | Giảm capacity/xóa tài nguyên đang dùng; mã trùng; đổi inactive với cam kết còn tồn tại        | Thay đổi phá invariant bị từ chối; không mồ côi tài nguyên/history; inactive theo policy được review                          | Boundary, decision         | TV4 / TV3                |
| IT-29 / P0   | UC-13; FR-09; BR-10         | Xe available/reserved/in_use ở fixture riêng                            | Báo xe hỏng; thử cấp mới; kiểm tra reservation/trip/history; đóng incident                    | Xe không nhận việc mới; luồng bị ảnh hưởng có xử lý; không mất trip; phục hồi sau kiểm tra hợp lệ                             | State, fault               | TV4 + TV2 / Leader       |
| IT-30 / P0   | UC-14; FR-10; BR-09         | Xe available ở nguồn, đích đủ chỗ                                       | Create/start/complete; đọc xe, nguồn/đích, order và log                                       | Trạng thái/vị trí/chỗ nhất quán; một xe không ở hai Hub; dashboard phản ánh commit                                            | Integration                | TV4 + TV2 + TV3 / TV5    |
| IT-31 / P0   | UC-04/14; FR-03/10; BR-09   | Xe available; operator điều chuyển, sinh viên đặt                       | Gửi start redistribution và reserve cùng barrier; thử complete lúc đích đầy                   | Chỉ một luồng giữ xe; đích đầy không completed; không mất xe hoặc chiếm chỗ hai lần                                           | Concurrency, alternate     | TV4 + TV2 + TV3 / Leader |
| IT-32 / P1   | UC-15; FR-11; BR-13         | Snapshot hợp lệ; maximum steps M                                        | Step=0, step>horizon, horizon không chia hết; số bước M-1/M/M+1                               | Sai input vượt giới hạn bị chặn; case hợp lệ chạy; không response success giả                                                 | Boundary, partition        | TV5 / TV3                |
| IT-33 / P0   | UC-15; FR-11; NFR-06; BR-13 | Snapshot/inputs/seed cố định; model version ghi lại                     | Chạy hai lần; so sánh chỉ số/event; so DB vận hành trước/sau                                  | Kết quả tương đương, bỏ qua run ID/time metadata; DB thực không đổi; không alias mutable object                               | Reproducibility, isolation | TV5 / Leader             |
| IT-34 / P1   | UC-15; FR-11/12; BR-14      | Baseline và demand_surge cùng snapshot/seed; mô hình đơn giản có oracle | Tăng arrivalsPerStep; đối chiếu demand/served/unserved và conservation                        | Chỉ số tính từ event; served+unserved=demand theo định nghĩa; trường hợp nhỏ khớp oracle; không mặc định mọi chỉ số luôn tăng | Model-based                | TV5 / TV2                |
| IT-35 / P1   | UC-15; FR-11/12; BR-14      | parking_full, charging_failure; biết resources và scenario inputs       | Chạy từng scenario và baseline; kiểm capacity/failed point; xem đề xuất                       | Mô hình tôn trọng capacity/point failed; đề xuất có lý do và resource khả thi hoặc nêu không có phương án                     | Model-based, fault         | TV5 / TV3                |
| IT-36 / P0   | UC-14/15; FR-10/12; BR-15   | Đề xuất từ snapshot; sau đó xe bị đặt hoặc đích đầy                     | Operator áp dụng đề xuất cũ                                                                   | Kiểm trạng thái hiện tại và từ chối điều kiện không còn đúng; không replay snapshot vào DB hoặc ghi completed giả             | State, integration         | TV5 + TV4 / Leader       |

P0 là trọng yếu cho đúng dữ liệu/quyền/tài nguyên; P1 là luồng chính, usability hoặc tính đúng chỉ số. Severity defect được đánh giá theo tác động thực, không tự đồng nhất với ưu tiên testcase.

## Traceability theo yêu cầu

| FR    | Use case                     | Testcase                |
| ----- | ---------------------------- | ----------------------- |
| FR-01 | UC-02/11                     | IT-04/05/20/27          |
| FR-02 | UC-03                        | IT-06                   |
| FR-03 | UC-04                        | IT-07/08/09/10/31       |
| FR-04 | UC-05/06                     | IT-10/11/12/13/14/15/16 |
| FR-05 | UC-07/08                     | IT-17/18/19/20/21       |
| FR-06 | UC-09/10                     | IT-22/23/25/26          |
| FR-07 | UC-10                        | IT-24/25                |
| FR-08 | UC-12                        | IT-28                   |
| FR-09 | UC-13                        | IT-26/29                |
| FR-10 | UC-14                        | IT-30/31/36             |
| FR-11 | UC-15                        | IT-32/33/34/35          |
| FR-12 | UC-15                        | IT-34/35/36             |
| FR-13 | UC-01 và mọi luồng có bảo vệ | IT-01/02/03/17/21/23/27 |

## Kiểm tra chất lượng bổ sung

- NFR-01: case P0 concurrency/rollback; bổ sung retry/deadlock test khi có cơ chế retry thực, không khẳng định test race hữu hạn chứng minh mọi trường hợp.
- NFR-02: server-side auth, không log/commit secret, cookie flags, Origin, expiry/revoke và rate limit. Test rate limit ở instance riêng để không ảnh hưởng case khác.
- NFR-03: đề xuất mục tiêu để nhóm duyệt: đọc Hub/overview p95 ≤1 giây dưới 20 người dùng đồng thời, dataset 30 Hub/300 xe; warm-up và chạy đo 5 phút trên máy ghi cấu hình. Dữ liệu tải/threshold là tham số test, chưa phải mục tiêu đã duyệt hoặc kết quả đo. Polling phản ánh thay đổi trong một chu kỳ cấu hình cộng latency API khi tab visible, không áp mục tiêu này cho tab background.
- NFR-04: kiểm tra keyboard, label, loading/error/empty và màn hình hẹp; không có số liệu giả khi API lỗi.
- NFR-05: review component/hook/model/repository separation; build/format trên checkout sạch; migration không sửa bản đã áp dụng.
- NFR-06: IT-33 và model version/inputs/seed đầy đủ; mọi nguồn random đi qua seed điều khiển được.

## Lịch và trách nhiệm

Tuần thi 13–19/10: owner review spec/fixtures. Tuần 20–26/10: chạy luồng cơ bản khi module có code. Tuần 27/10–02/11: chạy concurrency/state/fault/simulation. Ngày 03–05/11: kiểm thử chéo và regression. Ngày 06–08/11: gate bộ nộp, setup máy khác, quay demo. Leader quản lý defect và traceability; owner ghi bằng chứng, người chéo xác minh lại sau fix.

## Execution log và defect log

Mỗi lần chạy ghi: execution ID, testcase ID, commit SHA, người chạy, thời gian, môi trường, fixture/policy/seed, actual result, status, evidence và defect ID. Status: not-run / blocked / pass / fail. Case blocked phải có lý do và dependency; pass cần assertion/ảnh/log cụ thể.

Không điền kết quả thực vào tài liệu này khi chưa chạy. Lưu execution ở `docs/test-runs/` khi phát sinh; log không chứa password/session token. Defect có mức độ, bước tái lập, expected/actual, owner, trạng thái và commit sửa; retest ghi execution mới, không xóa lịch sử fail.

## Kịch bản demo khoảng 3 phút (dự kiến)

1. Sinh viên xem Hub/pin → đặt → nhận → trả xe; dashboard phản ánh chỗ và xe.
2. Xe cá nhân đặt đỗ/yêu cầu sạc; operator xem hàng chờ và phân bổ.
3. Operator ghi sự cố hoặc điều chuyển; trạng thái tài nguyên cập nhật.
4. Chạy một What-if, xem baseline/scenario và đề xuất có căn cứ.

Chỉ quay khi các chức năng tương ứng đã có và chạy thật. Nếu chưa hoàn thành, nêu giới hạn; không dựng UI kết quả giả để quay. Demo recorded bắt buộc theo guideline; chưa có video được tạo trong bước này.
