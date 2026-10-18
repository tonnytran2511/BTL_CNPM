# Hợp đồng API nền tảng v0.1

Prefix `/api`; JSON; ID UUID; thời gian ISO 8601 có timezone; pin và tỷ lệ sử dụng đơn vị %. Kiểu chính xác tại `packages/contracts/index.ts`.

| Method / path            | Quyền     | Response                         | Trạng thái                                                    |
| ------------------------ | --------- | -------------------------------- | ------------------------------------------------------------- |
| GET /health              | Public    | `{status: "ok"}` sau truy vấn DB | 200; DB lỗi → 500                                             |
| GET /config              | Public    | `PublicConfig`                   | 200                                                           |
| POST /auth/login         | Public    | `User`; Set-Cookie session       | 201; DTO sai 400; sai thông tin 401; rate limit 429           |
| GET /auth/me             | Đăng nhập | `User`                           | 200; session không hợp lệ 401                                 |
| POST /auth/logout        | Public    | `{success: true}`; clear cookie  | 201; revoke session nếu có                                    |
| GET /hubs                | Đăng nhập | `HubSummary[]`                   | 200; sinh viên chỉ thấy Hub active                            |
| GET /hubs/:id            | Đăng nhập | `HubDetail`                      | 200; ID sai 400; không tồn tại/Hub inactive với sinh viên 404 |
| GET /network/overview    | Operator  | `NetworkOverview`                | 200; sinh viên 403                                            |
| GET /simulation/snapshot | Operator  | `SimulationSnapshot`             | 200; sinh viên 403                                            |
| GET /vehicles            | Đăng nhập | `VehicleSearchResult`            | 200; query sai 400; chưa đăng nhập 401                        |

Login body: `{email: string, password: string}`. Không nhận role từ client; field ngoài DTO bị từ chối. Response user chỉ gồm `id,email,name,role`.

Browser dùng `credentials: include`, cùng origin qua proxy. Mutation phải có Origin đúng `WEB_ORIGIN` nếu mang cookie; Origin khác bị từ chối 403. API không phát token trong response body hoặc localStorage.

Lỗi có dạng `{statusCode: number, code: "HTTP_<status>", message: string}`; validation message ghép thành chuỗi. Lỗi server không gửi chi tiết SQL/secret. Không tự retry mutation mà chưa thiết kế idempotency.

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

| Chủ module | Đề xuất                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| TV2        | GET /vehicles; POST /vehicle-reservations; POST /vehicle-reservations/:id/cancel; POST /vehicle-reservations/:id/pickup; POST /trips/:id/return |
| TV3        | Đã triển khai local các endpoint `/mobility` bên dưới; scheduler/phiên sạc còn chờ tuần 2.                                                      |
| TV4        | POST/PATCH /hubs; POST /incidents; POST /redistributions và lệnh chuyển trạng thái                                                              |
| TV5        | POST /simulations; GET /simulations/:id; GET /simulations                                                                                       |

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
- Chưa làm: tự động chuyển `expired` khi quá hạn (T16), nhận xe `fulfilled` (T08), Idempotency-Key (BR-11).

## Thuê xe: nhận xe, trả xe, chuyến thuê (T08)

Mọi route cần đăng nhập; người dùng lấy từ session. Chỉ chủ lượt đặt được nhận xe và chỉ chủ chuyến được trả xe (người khác nhận 403).

| Route                                   | Mô tả                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST /vehicle-reservations/:id/pickup` | Nhận xe (BR-02). Trả `TripView`. Gửi lặp trên lượt đã nhận trả lại đúng chuyến cũ, không tạo chuyến thứ hai.     |
| `POST /trips/:id/return`                | Trả xe (BR-03). Body `{ targetHubId }`. Trả `TripView` đã `completed`. Gửi lặp cùng Hub đích trả lại kết quả cũ. |
| `GET /trips`                            | Chuyến của chính người dùng, mới nhất trước (tối đa 100); chuyến `active` là chuyến hiện tại.                    |

**Nhận xe** chạy trong một transaction: khóa reservation rồi khóa xe; reservation `active → fulfilled`; tạo trip `active` (pin lúc nhận lấy từ xe); xe `reserved → in_use` và `hub_id = NULL` (xe đang đi, không còn tính vào tài nguyên Hub); giải phóng chỗ đỗ ở Hub nguồn qua `AllocationPort.releaseRentalVehicleSpace`. Bước nào lỗi thì rollback toàn bộ. Từ chối bằng 409 khi: lượt đặt đã hủy/hết hạn, quá `expires_at` (theo đồng hồ database), xe không còn `reserved` (ví dụ bảo trì), xe không chiếm chỗ ở Hub nguồn, Hub nguồn ngừng hoạt động.

**Trả xe** chạy trong một transaction: khóa trip rồi khóa xe; xe phải `in_use`; chiếm chỗ ở Hub đích qua `AllocationPort.claimRentalVehicleSpace` (Hub đích phải `active`, chỗ không vướng lịch đặt đỗ còn hiệu lực); xe `in_use → available` và `hub_id = Hub đích`; trip `active → completed` với `ended_at`, Hub đích và pin cuối. Hub đích đầy hoặc ngừng hoạt động: 409, trip giữ `active`, response có `details.suggestedHubs` (tối đa 5 Hub active còn chỗ, kèm `freeSpaces`). Đây là cùng điều kiện "chỗ còn trống" mà `MobilityRepository.claimRental` dùng.

Giới hạn hiện tại: pin cuối chuyến bằng pin hiện có của xe (chưa có mô hình hao pin hay telemetry); đặt chỗ quá hạn vẫn `active` cho đến khi T16 xử lý hết hạn; kiểm tra pin/xe hỏng khi nhận và chống thao tác lặp mở rộng thuộc T17.
