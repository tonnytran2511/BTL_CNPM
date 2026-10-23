# Smart E-Mobility Hub — định hướng thiết kế

## T14 — hoàn tất tích hợp T35 ngày 23/10/2026

T35 của Quỳnh Anh đã merge qua PR #13 vào main `5d0d4d2`. Ba điểm review đã sửa: khóa cổng sạc trước kiểm tra incident, giữ form khi mutation thất bại, tách logic/model khỏi UI. T14 bổ sung regression HTTP/PostgreSQL cho CRUD, quyền operator, dashboard động, inactive Hub, sức chứa có hold/booking, rollback và incident/delete đồng thời. Giao diện và file TXT đã được kiểm tra trên DB tạm; bằng chứng tại `demo/T14-t35-completion.md`.

Phần tích hợp kỹ thuật T14 không còn phụ thuộc T35. Nghiệm thu/demo và giải thích của từng thành viên vẫn cần người phụ trách xác nhận; không tự coi test của Codex là peer review của sinh viên. T16 ở PR #14, scheduler/phiên sạc, hoàn tất điều chuyển và simulation mở rộng vẫn ngoài phạm vi bản này.

## T14 — lịch sử đối chiếu ngày 20/10/2026

Main `435f7a0` sau PR #11 có rental T08, mobility T09–T11, operations T12 và simulation T13 cùng nền auth/dashboard. Demo Chrome trên DB tạm đã chạy thuê xe, đặt/check-in/out, queue sạc, simulation; T12 được kiểm tra qua API do chưa có UI. Bằng chứng và giới hạn tại `demo/T14-integrated-demo.md`, `docs/defects.md`. Các ghi chú lịch sử phía dưới mô tả thời điểm triển khai cũ, không thay thế trạng thái mới này.

Theo xác nhận Minh Tường, T35 còn chờ Quỳnh Anh và không được triển khai thay trong T14. Chưa nghiệm thu đủ gate T14 hoặc công bố feature-complete; scheduler/phiên sạc, hoàn tất điều chuyển và simulation mở rộng vẫn là phạm vi tuần 2. Runner `npm run demo:t14` chỉ tạo fixture cô lập; seed không trở thành nguồn trạng thái vận hành/UI.

Trạng thái: nền tảng đã triển khai; thiết kế nghiệp vụ của các module thành viên tiếp tục được review.
Nguồn: `Assignment_SoftwareEngineering_HK261.pdf` và `Guideline and Rubric.pdf`.

## Phạm vi

Hai vai trò chính: sinh viên và người vận hành. Quản lý mạng lưới Hub, thuê xe dùng chung, đỗ/sạc cho xe cá nhân, sự cố, điều chuyển và What-if Simulation. Dữ liệu vận hành có thể giả lập.

Trong kế hoạch hiện tại, thanh toán, IoT thật, bản đồ 3D, mobile riêng và dự báo ML nằm ngoài phạm vi. Đây là quyết định phạm vi của nhóm, không phải yêu cầu loại trừ trong đề bài.

## Phân quyền sở hữu module

| Vai trò     | Module và trách nhiệm                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| Nhóm trưởng | Nền tảng, auth/phân quyền, API client, dashboard, kiến trúc, dữ liệu chung và tích hợp |
| TV2         | Vehicle, reservation, trip; vòng đời thuê xe                                           |
| TV3         | Private vehicle, parking, charging; phân bổ chỗ đỗ/cổng sạc                            |
| TV4         | Quản trị Hub/tài nguyên, incident, redistribution, lịch sử vận hành                    |
| TV5         | Snapshot, scenario, simulation engine, impact metrics, recommendations                 |

Tên TV2–TV5 chỉ mô tả vai trò; không dùng làm định danh người dùng trong hệ thống.

## Kiến trúc dự kiến

Frontend → API → services/domain → data access → database.

- Frontend gồm UI, hooks, model/type và API client tách biệt.
- Backend triển khai theo module trong cùng một ứng dụng để giảm chi phí tích hợp.
- Auth kiểm tra danh tính và quyền tại backend; các service kiểm tra quyền sở hữu tài nguyên.
- Dashboard đọc trạng thái tổng hợp từ API; polling là phương án ban đầu, chu kỳ cập nhật cấu hình được. HTTP client có deadline theo `VITE_API_TIMEOUT_MS` được kiểm tra khi build/dev, hủy request chậm để UI có thể phục hồi. Deadline không đảm bảo server đã hủy mutation; không tự replay thao tác gửi dữ liệu.
- T15 (20/10): mỗi refresh xác minh lại danh tính/role qua `/auth/me` trước khi đọc tài nguyên. Đổi tài khoản/quyền hoặc dashboard bị từ chối 403 thì xóa cache phía UI và yêu cầu đăng nhập lại. Khi mạng trở lại và tab visible, thử refresh ngay; lỗi tạm vẫn giữ dữ liệu có timestamp cũ. Backend tiếp tục quyết định quyền ở từng request.
- Simulator lấy snapshot chỉ đọc; chạy trên trạng thái riêng và lưu kết quả riêng.
- Đề xuất simulation không tự thay đổi vận hành. Khi thực thi, tạo lệnh nghiệp vụ và kiểm tra lại điều kiện hiện tại.

Stack: React + TypeScript + Vite; NestJS + TypeScript; PostgreSQL. Data access dùng `pg` và migration SQL, chưa dùng ORM. Workspace chia `apps/web`, `apps/api`, `packages/contracts`.

Xác thực: session opaque, token ngẫu nhiên chỉ nằm trong cookie HttpOnly/SameSite Strict; database lưu SHA-256 của token, thời hạn và user. Mật khẩu dùng scrypt với salt riêng. Logout xóa session; mỗi request đọc quyền hiện tại từ user đang active. Mutation kiểm tra Origin; login có rate limit cấu hình được. Bản hiện tại chỉ có đăng nhập tài khoản được cấp qua seed, chưa có đăng ký/quên mật khẩu.

Hợp đồng endpoint đã triển khai tại `docs/api.md`; ERD/kiến trúc tại `docs/architecture.md`; hướng dẫn mở rộng tại `docs/guides/CONTRIBUTING.md`.

15/10 — phần Mai Anh tuần 1 có implementation local tại MobilityModule; chưa có xác nhận peer review/merge. AllocationPort có provider thực, nhận cùng PoolClient của caller. Lịch tương lai tách khỏi trạng thái vật lý. Chính sách bảo thủ: chỗ đang bị chiếm/giữ còn hạn không được hứa cho lịch tương lai khi chưa biết giờ rời; trả xe thuê không chiếm chỗ có lịch tương lai còn hiệu lực. Chỗ quá giờ chưa check-out vẫn occupied và chặn check-in sau; không tự xóa xe khỏi chỗ. Nhóm cần review chính sách này trước tích hợp. Pin cá nhân là dữ liệu khai báo lúc đăng ký, xe cũ không có pin giữ null. Bản tuần 1 hỗ trợ check-in/check-out để xác nhận vị trí trước yêu cầu sạc; chưa chạy phiên/scheduler. Hợp đồng API tại `docs/api.md`; kết quả kiểm tra tại `docs/testing.md`.

### Lý do chọn stack

Người dùng đã xác nhận frontend/backend và cho phép triển khai PostgreSQL cùng simulation TypeScript:

| Phần       | Đề xuất                                                      | Lý do và đánh đổi                                                                                                                                             |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | React + TypeScript + Vite                                    | UI theo component; tách hooks/model; Vite có template React/TypeScript. Cần nhóm quen React và TypeScript.                                                    |
| Backend    | NestJS + TypeScript                                          | Cấu trúc module/controller/service phù hợp phân công nghiệp vụ; dùng chung ngôn ngữ với frontend. Cần học dependency injection và quy ước Nest nếu chưa quen. |
| Database   | PostgreSQL                                                   | Phù hợp dữ liệu quan hệ và ràng buộc tài nguyên; hỗ trợ transaction/isolation. Chống xung đột vẫn cần thiết kế constraint/transaction và xử lý retry phù hợp. |
| Giao tiếp  | REST API; polling cấu hình được                              | Dễ mô tả hợp đồng và kiểm thử; chu kỳ cập nhật cần đo và chốt.                                                                                                |
| Simulation | Module TypeScript trong backend, engine tính toán tách riêng | Dùng snapshot và model chung; có thể kiểm thử độc lập với HTTP/database.                                                                                      |

Hiện dùng CSS thuần và Node test runner cho integration test. SQL nằm trong repositories; migration quản lý schema tường minh để các thành viên đọc và bổ sung ràng buộc transaction. Chưa triển khai production/deployment.

Tài liệu chính thức đã đối chiếu:

- Vite: https://vite.dev/guide/
- NestJS: https://docs.nestjs.com/
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html

## Các ranh giới cần bảo vệ

- TV2 gọi service parking để nhận/trả xe; không tự trừ/cộng sức chứa Hub.
- TV4 gọi các service tài nguyên để điều chuyển; không sửa trực tiếp trạng thái xe hoặc chỗ đỗ.
- TV3 sở hữu trạng thái cổng/phiên sạc và xử lý ảnh hưởng khi cổng sạc hỏng; TV4 phối hợp ghi nhận sự cố.
- TV5 dùng snapshot có hợp đồng dữ liệu rõ ràng từ các module; không đọc/ghi tùy tiện database vận hành.
- Việc giữ tài nguyên và chuyển trạng thái liên quan phải nguyên tử; phương án transaction/locking phụ thuộc database được chọn.

## Quy tắc nền tảng cần thống nhất

1. Một xe không được cấp đồng thời cho hai lượt đặt/thuê còn hiệu lực.
2. Tổng tài nguyên đang chiếm và đang giữ hợp lệ không vượt sức chứa theo quy tắc thời gian đã chốt.
3. Một cổng sạc không phục vụ các phiên xung đột; cổng hỏng không nhận phiên mới.
4. Mọi chuyển trạng thái có điều kiện và actor được phép; sai trạng thái phải bị từ chối.
5. Request gửi lặp không tạo chuyến đi, phiên sạc hoặc lệnh hoàn thành trùng.
6. Thời gian lưu trữ/API có múi giờ rõ ràng; frontend định dạng khi hiển thị.
7. Sức chứa, ngưỡng pin, thời hạn giữ xe, trọng số ưu tiên sạc và tham số mô phỏng lấy từ dữ liệu/cấu hình.

## Các quyết định còn mở

Baseline cụ thể cho các lựa chọn nghiệp vụ tại `docs/business-rules.md`; checklist review tại `docs/leader-review.md`. Các baseline này phục vụ triển khai và chờ review thành viên, không tự coi là cả nhóm đã duyệt. `packages/contracts/planned.ts` chứa kiểu request/response đề xuất; endpoint tương ứng chưa có code.

- Chọn môi trường triển khai dùng chung; local đã có Docker Compose hoặc embedded PostgreSQL.
- Chọn trạng thái và chuyển trạng thái của từng entity.
- Đặt xe có đồng thời giữ chỗ tại Hub đích hay không; xử lý Hub đích đầy khi trả xe.
- Đặt đỗ/sạc dùng khoảng thời gian nào; cách phân biệt chỗ trống, đang chiếm và đang giữ.
- Quy tắc ưu tiên sạc, chống chờ vô hạn và xử lý phiên bị gián đoạn.
- Giả định simulation: bước thời gian, nhu cầu, thời gian đi/sạc và cách đánh giá đề xuất.
- Hợp đồng API: ID, thời gian, đơn vị, mã lỗi, phân trang, version trạng thái nếu cần.

## Kiểm chứng thiết kế

Đặc tả use case và source UML nằm trong `docs/use-cases.md`, `docs/diagrams/`; kế hoạch test tích hợp và mục tiêu NFR đề xuất nằm trong `docs/integration-test-plan.md`. Trạng thái thực thi thực tế được ghi riêng ở `docs/testing.md` và execution logs khi có. Không chuyển một testcase kế hoạch thành kết quả đã kiểm chứng.

Kiểm tra luồng bình thường, sai quyền, hết hạn, xung đột đồng thời, Hub đầy, cổng sạc hỏng và request lặp. Với simulation, kiểm tra kết quả tái lập theo đầu vào/seed và dữ liệu vận hành không bị đổi.

Use case, kiến trúc, ERD và sơ đồ hành vi phải được cập nhật theo triển khai thực tế. Các chỉ tiêu phi chức năng chỉ được đánh dấu đạt khi có phép đo hoặc bằng chứng kiểm tra.

## T13 — 17/10/2026

SimulationModule dùng HubsService.snapshot() và settings; engine departures-v1 thuần so sánh baseline/scenario cùng seed, có operator UI. Giả định/giới hạn tại docs/simulation.md. Chưa lưu lịch sử/chưa mô phỏng trả xe/sạc; chờ peer review. Không ghi dữ liệu vận hành.

## Tích hợp 18/10/2026

PR #1/#2/#6/#7 được ghép với nền T13. Dashboard, mobility, rental search/reservation và simulation dùng cùng API client có deadline; test runner thu thập toàn bộ API suite. T12 tách SQL khỏi service; đổi trạng thái xe khi bắt đầu điều chuyển qua RentalService trong cùng transaction. Phạm vi T12 chỉ gồm nhật ký sự cố và tạo/bắt đầu/hủy lệnh trước khi chạy; hoàn tất điều chuyển và tác động sự cố lên thuê/sạc còn là workflow chưa triển khai, xem architecture.md và api.md. Chưa coi demo UI/NFR hoặc toàn bộ module là hoàn thành chỉ vì merge PR.

## Tích hợp T08 — 20/10/2026

Nhận/trả dùng TripService và AllocationPort cùng PoolClient; khóa Hub trước xe/chỗ để phối hợp với vận hành. UI hỗ trợ mọi chuyến active của tài khoản; chưa có quy tắc giới hạn một chuyến/người. Gợi ý Hub khi trả thất bại lấy số lượng từ settings.returnHubSuggestionLimit (migration 004), kiểm tra hợp lệ, không giữ chỗ. API client giữ code và details với deadline chung; 5xx không lộ details. T16/T17, scheduler và hoàn tất điều chuyển vẫn ngoài phạm vi tích hợp T08.

## T18 — 20/10/2026, nền tích hợp c73dabe

MobilityModule export ChargingAllocationService để giữ cổng cho xe cá nhân, dùng cùng transaction của caller. Khóa Hub → xe → request → point; kiểm tra lại quyền operator, chủ xe, vị trí, pin và cổng; đổi point occupied, request allocated và tạo session scheduled nguyên tử. Gửi lặp cùng request/point trả phiên active hiện có. Chưa có scheduler hoặc API start/complete/cancel (T19), chưa có xử lý gián đoạn (T20). RentalService hiện có search/reservation và ranh giới điều chuyển nhưng chưa có thao tác giữ/đổi trạng thái xe cho sạc; phối hợp Duy Tân tại điểm này, không tự sửa module rental. T18 chờ review/tích hợp; chi tiết docs/allocation-safety.md.

## T19 — điều phối sạc xe cá nhân

Đã triển khai local cho xe cá nhân và xe thuê, chờ review: UI → useChargingManager → charging API → ChargingWorkflowService → repository. Thuật toán ưu tiên là hàm thuần, ngưỡng lấy settings. Phân bổ dùng ChargingAllocationService trong cùng transaction; kết thúc ghi pin quan sát và giải phóng cổng cùng transaction. Chi tiết và các phần chờ tại [charging-scheduler.md](../charging-scheduler.md).
