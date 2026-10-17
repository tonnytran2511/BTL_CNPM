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
| TV3        | POST /private-vehicles; POST /parking-reservations; POST /charging-requests; GET /charging-queue                                                |
| TV4        | POST/PATCH /hubs; POST /incidents; POST /redistributions và lệnh chuyển trạng thái                                                              |
| TV5        | POST /simulations; GET /simulations/:id; GET /simulations                                                                                       |

Không thêm endpoint success giả hoặc dữ liệu mẫu trong component để thay phần chưa triển khai.

Kiểu payload baseline tại `packages/contracts/planned.ts`; quy tắc và testcase tại `docs/business-rules.md`. Endpoint mới cần request validation, response type và mã lỗi nghiệp vụ được review; hiện `ApiError.code` mới có HTTP_<status>. Không công bố mã lỗi nghiệp vụ như đã triển khai khi chưa có controller/service tương ứng.

## GET /vehicles (T06, đã triển khai)

Query tùy chọn: `hubId` (UUID), `type` (`electric_bicycle` | `electric_motorcycle`), `minBatteryPercent` (0–100). Chỉ trả xe `available` ở Hub `active` có pin không thấp hơn `minimumRentalBatteryPercent` trong bảng `settings`; bộ lọc của người dùng chỉ có thể nâng ngưỡng này lên. Response: `{minimumBatteryPercent, vehicles: RentableVehicle[]}` sắp xếp theo pin giảm dần. Chưa phân trang.

## Đặt / hủy xe (T07, đã triển khai)

Mọi endpoint cần đăng nhập (cookie session). `userId` lấy từ session, không nhận từ body; field ngoài DTO bị từ chối 400. Mutation phải có Origin đúng `WEB_ORIGIN` khi mang cookie.

| Method / path                        | Response                    | Trạng thái                                                                                  |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------- |
| GET /vehicle-reservations            | `VehicleReservationView[]`  | 200; chỉ lượt của chính người gọi, mới nhất trước, tối đa 100; chưa đăng nhập 401            |
| POST /vehicle-reservations           | `VehicleReservationView`    | 201; body `{vehicleId}` sai 400; xe không tồn tại 404; xe không còn đặt được 409             |
| POST /vehicle-reservations/:id/cancel | `VehicleReservationView`    | 200; id sai 400; không tồn tại 404; không phải chủ 403; không còn `active` 409               |

- Đặt xe (BR-01): xe phải `available`, thuộc Hub `active`, pin không thấp hơn `minimumRentalBatteryPercent`. Xe chuyển `reserved`, tạo reservation `active` với `expiresAt = now + reservationHoldMinutes` (settings, tính bằng đồng hồ DB). Tất cả trong một transaction; hai người đặt cùng xe thì đúng một người thành công (khóa hàng xe + cập nhật có điều kiện + unique index `vehicle_reservations_active_vehicle_idx`).
- Hủy xe: chỉ chủ lượt đặt, chỉ khi `active`. Reservation thành `cancelled` (`closedAt` được ghi) và xe `reserved → available` bằng cập nhật có điều kiện: nếu xe đã bị đổi sang trạng thái khác (ví dụ sự cố, BR-10) thì không ghi đè.
- Lỗi vẫn theo dạng `{statusCode, code: "HTTP_<status>", message}`; chưa có mã lỗi nghiệp vụ riêng.
- Chưa làm: tự động chuyển `expired` khi quá hạn (T16), nhận xe `fulfilled` (T08), Idempotency-Key (BR-11).
