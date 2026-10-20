# Hợp đồng API nền tảng v0.1

Prefix `/api`; JSON; ID UUID; thời gian ISO 8601 có timezone; pin và tỷ lệ sử dụng đơn vị %. Kiểu chính xác tại `packages/contracts/index.ts`.

| Method / path                    | Quyền     | Response                         | Trạng thái                                                    |
| -------------------------------- | --------- | -------------------------------- | ------------------------------------------------------------- |
| GET /health                      | Public    | `{status: "ok"}` sau truy vấn DB | 200; DB lỗi → 500                                             |
| GET /config                      | Public    | `PublicConfig`                   | 200                                                           |
| POST /auth/login                 | Public    | `User`; Set-Cookie session       | 201; DTO sai 400; sai thông tin 401; rate limit 429           |
| GET /auth/me                     | Đăng nhập | `User`                           | 200; session không hợp lệ 401                                 |
| POST /auth/logout                | Public    | `{success: true}`; clear cookie  | 201; revoke session nếu có                                    |
| GET /hubs                        | Đăng nhập | `HubSummary[]`                   | 200; sinh viên chỉ thấy Hub active                            |
| GET /hubs/:id                    | Đăng nhập | `HubDetail`                      | 200; ID sai 400; không tồn tại/Hub inactive với sinh viên 404 |
| GET /network/overview            | Operator  | `NetworkOverview`                | 200; sinh viên 403                                            |
| GET /simulation/snapshot         | Operator  | `SimulationSnapshot`             | 200; sinh viên 403                                            |
| GET /vehicles                    | Đăng nhập | `VehicleSearchResult`            | 200; query sai 400                                            |
| POST /incidents                  | Operator  | `Incident`                       | 201; tài nguyên không tồn tại 404; payload sai 400            |
| POST /incidents/:id/resolve      | Operator  | `Incident`                       | 201; không tồn tại 404; đã xử lý 409                          |
| POST /redistributions            | Operator  | `Redistribution`                 | 201; xe/Hub không đủ điều kiện 409; payload sai 400           |
| POST /redistributions/:id/start  | Operator  | `Redistribution`                 | 201; không tồn tại 404; trạng thái/tài nguyên đổi 409         |
| POST /redistributions/:id/cancel | Operator  | `Redistribution`                 | 201; chỉ lệnh pending mới hủy được; 404/409                   |

Login body: `{email: string, password: string}`. Không nhận role từ client; field ngoài DTO bị từ chối. Response user chỉ gồm `id,email,name,role`.

Browser dùng `credentials: include`, cùng origin qua proxy. Mutation phải có Origin đúng `WEB_ORIGIN` nếu mang cookie; Origin khác bị từ chối 403. API không phát token trong response body hoặc localStorage.

Lỗi có dạng `{statusCode: number, code: "HTTP_<status>", message: string}`; validation message ghép thành chuỗi. Lỗi server không gửi chi tiết SQL/secret. Không tự retry mutation mà chưa thiết kế idempotency.

T15 (20/10): mọi lỗi 5xx, kể cả `HttpException` chứa message nội bộ, trả thông báo chung; mã HTTP và envelope giữ nguyên. Log của bộ lọc cũng chỉ ghi thông báo chung. Lỗi 4xx vẫn giữ message validation/nghiệp vụ để người gọi sửa yêu cầu.

## Ý nghĩa dữ liệu Hub

- `parking.capacity`: số hàng parking_spaces tại Hub; sức chứa không sao chép vào frontend.
- `occupied`: chỗ đang đỗ; `held`: chỗ giữ còn hạn; hết hạn không tính giữ chỗ.
- `available = capacity - occupied - held`; Hub inactive trả available bằng 0.
- Xe available tính theo trạng thái; lọc xe đủ pin cho hành trình thuộc nghiệp vụ TV2. `lowBattery` theo settings `lowBatteryThreshold` trong DB.
- Cổng sạc available/occupied/failed tính từ charging_points; Hub inactive không công bố cổng khả dụng.
- Tỷ lệ sử dụng tính chỗ occupied + held; Hub không có chỗ trả tỷ lệ 0.
- Snapshot bao gồm Hub detail tại cùng một transaction REPEATABLE READ READ ONLY. Đây là điểm mở rộng, chưa có nhu cầu/đặt chỗ/phiên sạc vì các module đó chưa tồn tại.

## Hợp đồng dự kiến cho module tiếp theo

Các endpoint dưới đây là đề xuất, **chưa tồn tại**; chủ module bổ sung DTO/response và review trước khi triển khai:

| Chủ module | Đề xuất                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------ |
| TV2        | Nhận/trả và danh sách chuyến đã triển khai bên dưới; hết hạn tự động còn thuộc T16         |
| TV3        | Đã triển khai local các endpoint `/mobility` bên dưới; scheduler/phiên sạc còn chờ tuần 2. |
| TV4        | Hub CRUD/cấu hình tài nguyên; incident/redistribution đã triển khai bên trên               |
| TV5        | POST /simulations; GET /simulations/:id; GET /simulations                                  |

TV4 đã triển khai các endpoint quản trị Hub/tài nguyên ở dưới cùng với incident và redistribution nêu ở trên. `POST /redistributions` chỉ tạo lệnh `pending`; `start` kiểm tra lại Hub, xe available tại nguồn và incident đang mở trong transaction rồi chuyển xe sang `redistributing`. `cancel` chỉ áp dụng trước khi bắt đầu. Hoàn tất điều chuyển cần allocation service của TV3 để chiếm chỗ ở Hub đích; endpoint hoàn tất chưa được bật cho đến khi service đó được tích hợp.

## T35 — Quản trị Hub và tài nguyên

Các endpoint dưới đây dành cho operator. Tạo Hub chuẩn hóa code thành chữ hoa. Sửa thông tin không sửa tài nguyên đang vận hành; xóa chỉ thành công khi không còn tham chiếu dữ liệu và không có incident Hub đang mở.

| Method / path                             | Input                                               | Response / quy tắc                                                             |
| ----------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| POST /hubs                                | `{code,name,location}`                              | 201; code duy nhất, 409 nếu trùng                                              |
| PATCH /hubs/:id                           | `{name?,location?,status?}`                         | 200; chỉ sửa trường gửi lên; 404 nếu không có Hub                              |
| DELETE /hubs/:id                          | —                                                   | 200 `{success:true}`; 404 nếu không có; 409 nếu còn dữ liệu liên quan/sự cố mở |
| PUT /hubs/:id/parking-capacity            | `{capacity}` (0–setting `maxParkingCapacityPerHub`) | 200 `{hubId,capacity}`; tạo/xóa hàng `parking_spaces` trong transaction        |
| POST /hubs/:id/charging-points            | `{code}`                                            | 201 cổng sạc trạng thái mặc định `available`; code duy nhất tại Hub            |
| DELETE /hubs/:id/charging-points/:pointId | —                                                   | 200 `{success:true}`; 409 nếu cổng đang occupied/có session hoặc không tồn tại |

`maxParkingCapacityPerHub` được lưu trong `settings` (migration 005, mặc định 5000) và đọc lại khi cấu hình. Giảm sức chứa không thể thấp hơn số chỗ occupied hoặc held còn hạn. Chỗ bị xóa phải available và không có booking tham chiếu (kể cả lịch sử); nếu không đủ chỗ an toàn thì toàn bộ thao tác rollback. Tạo/xóa cổng sạc không thay đổi trạng thái vận hành của các cổng còn lại. Request DTO từ chối field ngoài danh sách.

Không thêm endpoint success giả hoặc dữ liệu mẫu trong component để thay phần chưa triển khai.

## Mai Anh — API đỗ/sạc tuần 1

Tất cả endpoint `/mobility` yêu cầu session. POST yêu cầu header `Idempotency-Key` dài 1–128 ký tự; lưu kết quả cùng transaction. Cùng actor/operation/key và payload chuẩn hóa trả response cũ; khác payload trả 409. Không có TTL tự xóa key trong bản tuần 1.

| Method / path                                 | Input                         | Response / quyền                                                              |
| --------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| GET /mobility/private-vehicles                | —                             | `PrivateVehicle[]` của người đăng nhập                                        |
| POST /mobility/private-vehicles               | `{code,type,batteryPercent}`  | `PrivateVehicle`; owner lấy từ session                                        |
| GET /mobility/parking/availability            | query `hubId,startsAt,endsAt` | `ParkingAvailability`                                                         |
| GET /mobility/parking/bookings                | —                             | `ParkingBooking[]` của người đăng nhập                                        |
| POST /mobility/parking/bookings               | `ReserveParkingRequest`       | `ParkingBooking`                                                              |
| POST /mobility/parking/bookings/:id/cancel    | `{}`                          | `ParkingBooking`; chỉ chủ lịch, trạng thái reserved                           |
| POST /mobility/parking/bookings/:id/check-in  | `{}`                          | `ParkingBooking`; chỉ chủ lịch, trong giờ đặt và chỗ vật lý trống             |
| POST /mobility/parking/bookings/:id/check-out | `{}`                          | `ParkingBooking`; chỉ chủ lịch, trạng thái checked_in                         |
| GET /mobility/charging/requests               | —                             | `ChargingQueueEntry[]`; sinh viên chỉ thấy yêu cầu mình, operator thấy tất cả |
| POST /mobility/charging/requests              | `ChargingRequestInput`        | `{id,status:"queued"}`                                                        |

GET trả 200; POST trả 201. 400: DTO/time/pin/key sai; 401: chưa đăng nhập; 403: sai chủ sở hữu/quyền; 404: ID tài nguyên không tồn tại; 409: Hub ngừng, hết chỗ, lịch/xe/yêu cầu trùng, sai trạng thái hoặc key dùng lại khác nội dung. TypeScript interfaces tại `packages/contracts/mobility.ts`, request dùng lại `ReserveParkingRequest` và `ChargingRequestInput` trong planned.ts; các request này nay có implementation như bảng trên.

`type` là electric_bicycle/electric_motorcycle. Pin xe cá nhân do chủ xe khai báo khi đăng ký; xe cũ có pin null phải có dữ liệu pin trước khi gửi yêu cầu. Backend không tự giả định pin.

Lịch đỗ tương lai không thay đổi parking_spaces. So sánh `[startsAt,endsAt)`; yêu cầu timezone, bắt đầu ở tương lai, thời lượng không vượt settings.maximumParkingDurationMinutes. Seed mẫu chọn 1440 phút cho demo; không fallback trong service. Chỗ đang occupied hoặc held còn hạn bị loại vì chưa biết thời điểm rời. Chỗ có lịch tiếp giáp vẫn đặt được. Trả xe thuê chưa có thời gian rời nên không chiếm chỗ đã cam kết cho một lịch tương lai. Xem các giới hạn này tại tài liệu bàn giao trước khi review baseline.

Xe cá nhân phải đỗ thực tế tại đúng Hub khi yêu cầu sạc; target lớn hơn pin hiện tại, không quá 100. Xe thuê chỉ operator được yêu cầu và xe phải available tại Hub. Chỉ một yêu cầu queued/allocated cho một xe. Bản tuần 1 ghi hàng chờ FIFO theo thời điểm gửi/ID, không phân bổ cổng hay chạy sạc. Check-out hủy yêu cầu queued của xe; nếu đã allocated thì chặn, chờ workflow phiên sạc tuần 2.

Kiểu payload baseline tại `packages/contracts/planned.ts`; quy tắc và testcase tại `docs/business-rules.md`. Endpoint mới cần request validation, response type và mã lỗi nghiệp vụ được review; hiện `ApiError.code` mới có HTTP_<status>. Không công bố mã lỗi nghiệp vụ như đã triển khai khi chưa có controller/service tương ứng.

## Frontend cập nhật và lỗi

API client giữ `RequestError.status`, `RequestError.code` và message từ error envelope; thiếu code dùng `HTTP_<status>`. Lỗi kết nối có status 0; response thành công không đọc được JSON được coi là lỗi 502 phía client. Abort được giữ nguyên để hooks bỏ qua request đã hủy.

Dashboard chỉ có một request refresh tại một thời điểm, polling theo config và cập nhật khi tab trở lại visible. Chi tiết Hub dùng request riêng, không hủy request chậm vì dashboard vừa poll; lỗi tạm giữ dữ liệu gần nhất và cho thử lại. 401 xóa session state phía UI; 403/404 ở chi tiết xóa dữ liệu cũ. Không đổi endpoint hoặc quyền backend trong thay đổi này.

T15 (20/10): một lần refresh kiểm tra `/auth/me` trước khi đọc `/hubs` hoặc `/network/overview`, cùng bộ khóa refresh và cancellation. Nếu ID hoặc role khác phiên UI hiện tại, UI xóa dữ liệu tài khoản/dashboard và yêu cầu đăng nhập lại; không tự chuyển sang tài khoản khác do cookie đổi ở tab khác. Dashboard gặp 403 cũng xóa dữ liệu thay vì giữ cache operator. Đây là reset trạng thái frontend, không thu hồi cookie/session còn hợp lệ trên server. Backend vẫn kiểm tra session/quyền ở từng endpoint. Lỗi mạng/5xx giữ dữ liệu thành công gần nhất, kèm cảnh báo; sự kiện `online` khi tab visible thử refresh ngay, không đợi kỳ polling. Thêm một GET `/auth/me` mỗi refresh; deadline vẫn áp dụng riêng từng HTTP request, chưa có phép đo tải cho thay đổi này.

Mỗi request frontend có deadline `VITE_API_TIMEOUT_MS` từ cấu hình công khai khi build/dev; kiểm tra số nguyên dương trong giới hạn timer 32-bit. Deadline bao gồm cả đọc JSON. Quá hạn trả `RequestError` với status 0, code `REQUEST_TIMEOUT`; hủy từ hook vẫn giữ nguyên cancellation. Timer/listener được dọn khi hoàn tất. Client không tự retry mutation: timeout không chứng minh server chưa xử lý thao tác. Config này thuộc client, không thay đổi payload `/config` của server.

## GET /vehicles (T06, đã triển khai)

Query tùy chọn: `hubId` (UUID), `type` (`electric_bicycle` | `electric_motorcycle`), `minBatteryPercent` (0–100). Chỉ trả xe `available` ở Hub `active` có pin không thấp hơn `minimumRentalBatteryPercent` trong bảng `settings`; bộ lọc của người dùng chỉ có thể nâng ngưỡng này lên. Response: `{minimumBatteryPercent, vehicles: RentableVehicle[]}` sắp xếp theo pin giảm dần. Chưa phân trang.

## Đặt / hủy xe (T07, đã triển khai)

Mọi endpoint cần đăng nhập (cookie session). `userId` lấy từ session, không nhận từ body; field ngoài DTO bị từ chối 400. Mutation phải có Origin đúng `WEB_ORIGIN` khi mang cookie.

| Method / path                         | Response                   | Trạng thái                                                                        |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| GET /vehicle-reservations             | `VehicleReservationView[]` | 200; chỉ lượt của chính người gọi, mới nhất trước, tối đa 100; chưa đăng nhập 401 |
| POST /vehicle-reservations            | `VehicleReservationView`   | 201; body `{vehicleId}` sai 400; xe không tồn tại 404; xe không còn đặt được 409  |
| POST /vehicle-reservations/:id/cancel | `VehicleReservationView`   | 200; id sai 400; không tồn tại 404; không phải chủ 403; không còn `active` 409    |

- Đặt xe (BR-01): xe phải `available`, thuộc Hub `active`, pin không thấp hơn `minimumRentalBatteryPercent`. Xe chuyển `reserved`, tạo reservation `active` với `expiresAt = now + reservationHoldMinutes` (settings, tính bằng đồng hồ DB). Tất cả trong một transaction; hai người đặt cùng xe thì đúng một người thành công (khóa hàng xe + cập nhật có điều kiện + unique index `vehicle_reservations_active_vehicle_idx`).
- Hủy xe: chỉ chủ lượt đặt, chỉ khi `active`. Reservation thành `cancelled` (`closedAt` được ghi) và xe `reserved → available` bằng cập nhật có điều kiện: nếu xe đã bị đổi sang trạng thái khác (ví dụ sự cố, BR-10) thì không ghi đè.
- Lỗi vẫn theo dạng `{statusCode, code: "HTTP_<status>", message}`; chưa có mã lỗi nghiệp vụ riêng.
- Chưa làm: tự động chuyển `expired` khi quá hạn (T16), Idempotency-Key (BR-11).

## T13 Simulation

`GET /simulations/config` (operator, 200, SimulationLimits) và `POST /simulations/demand-surge` (operator, 201, DemandSimulationResult) đã triển khai. Request/validation/đơn vị tại [simulation.md](simulation.md); kiểu tại packages/contracts/simulation.ts. Endpoint lưu/list kết quả vẫn là kế hoạch T22.

## Giới hạn T12 sau tích hợp

Payload incident: `{resourceType: "vehicle" | "charging_point" | "hub", resourceId, description}`; description phải chứa ký tự không trắng, trim trước khi lưu. Payload redistribution: `{sourceHubId, targetHubId, vehicleIds}`; Hub khác nhau, danh sách không trống/trùng. ID/actor lấy từ session; field ngoài DTO bị từ chối. Hub/xe sai trạng thái hoặc xe có incident đang mở chặn tạo/bắt đầu điều chuyển; start kiểm tra lại trong transaction. Hai lệnh hoặc reservation/start tranh cùng xe chỉ một thao tác chiếm được xe.

Incident hiện chỉ ghi nhận/resolve; chưa tự đổi trạng thái vận hành hoặc xử lý reservation/trip/charging. Lệnh in_progress chưa có endpoint hoàn tất hay hủy; vị trí/chỗ nguồn được giữ đến workflow điều chuyển tiếp theo. Chưa có Idempotency-Key cho T12; không tự replay POST khi timeout. Các giới hạn này là phần chưa triển khai, không phải thay đổi quy tắc BR-08/BR-10/BR-11.

## T08 — nhận/trả và lịch sử chuyến

| Method / path                         | Quyền                               | Response        |
| ------------------------------------- | ----------------------------------- | --------------- |
| POST /vehicle-reservations/:id/pickup | Chủ reservation                     | 200, TripView   |
| POST /trips/:id/return                | Chủ trip; body `{targetHubId}`      | 200, TripView   |
| GET /trips                            | Đăng nhập; chỉ chuyến của người gọi | 200, TripView[] |

ID/body sai 400, chưa đăng nhập 401, sai chủ 403, không tồn tại 404, sai trạng thái/hết hạn/Hub đầy hoặc inactive 409. Nhận xe chỉ trước expires_at, từ reserved tại Hub nguồn active; trong cùng transaction tạo trip active, reservation fulfilled, xe in_use/hub_id null và giải phóng chỗ nguồn. Trả xe chỉ khi in_use; claim chỗ đích và hoàn tất trip/cập nhật vị trí cùng transaction. Pin cuối lấy pin hiện có, chưa có telemetry/hao pin.

Lặp pickup của reservation fulfilled trả lại trip cũ. Lặp return của trip completed với cùng đích trả kết quả cũ; khác đích 409. Đây là xử lý theo trạng thái, chưa phải Idempotency-Key tổng quát T17. Không tự retry POST khi timeout.

Hub đích đầy/inactive: rollback và trả 409 với `details: {suggestedHubs: HubSuggestion[]}`. Gợi ý chỉ là số liệu tại lúc đọc, không giữ chỗ; lấy tối đa `settings.returnHubSuggestionLimit`, số nguyên dương trong phạm vi integer PostgreSQL, được kiểm tra hợp lệ (thiếu/sai → 500 chung). Migration 004 lưu baseline 5 từ T08, có thể đổi trong DB; không có fallback/hằng số giới hạn trong service/UI. Điều kiện chỗ trống loại chỗ đã cam kết cho lịch đỗ còn hiệu lực như AllocationPort.

GET trips trả mọi chuyến active và tối đa 100 chuyến completed mới nhất, sắp thời điểm giảm dần; UI có điều khiển trả riêng cho từng chuyến active, không giả định mỗi người chỉ thuê một xe. RequestError giữ đồng thời code, status và details; filter chỉ chuyển tiếp details cho 4xx, không cho 5xx. Module mới sử dụng cùng API client/deadline với dashboard, mobility và simulation.
