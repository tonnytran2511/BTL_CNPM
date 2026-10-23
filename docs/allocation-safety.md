# T18 — bảo vệ phân bổ parking và charging

Cập nhật 23/10/2026: T18 đã ghép main a80ca54 có T08/T35; bản này chỉ local. Build và 84 API + 40 frontend tests pass; chi tiết [execution T18](test-runs/2026-10-23-t18-main-integration.md). Các ghi chú nền c73dabe phía dưới là lịch sử ngày 20/10.

Nền tích hợp: main c73dabe trong folder BTL_CNPM-main (2). Rental search/reservation, operations và simulation đã có; chưa có API/service chuyển trạng thái xe cho sạc trong RentalService.

Trạng thái 20/10/2026: phần độc lập đã có code và kiểm thử local; chưa peer review, merge hoặc nghiệm thu luồng thuê xe/điều chuyển xuyên module. Căn cứ FR-05/06, NFR-01 và BR-02–06/11.

## Parking

Tái sử dụng transaction, Hub lock, cập nhật chỗ có điều kiện và PostgreSQL exclusion constraints từ tuần 1. Không sửa migration đã áp dụng. Các khoảng lịch `[startsAt,endsAt)` tiếp giáp được phép; trùng chỗ hoặc trùng xe bị chặn cả khi ghi SQL trực tiếp. Hub lock tránh hai request trong module cùng cấp chỗ cuối. Unique vehicle trên parking_spaces bảo vệ mỗi xe chỉ chiếm một chỗ vật lý.

Lịch tương lai tách khỏi trạng thái vật lý. Hold còn hạn chặn đặt chỗ theo chính sách hiện tại; hold hết hạn có thể dùng lại. Quá giờ lịch không tự giải phóng xe đang đỗ: check-in sau bị từ chối nếu chỗ vẫn occupied. Đây là chính sách bảo thủ đã nêu trong baseline local, cần nhóm review khi tích hợp.

## Charging allocation nội bộ

MobilityModule export `ChargingAllocationService`:

```typescript
allocatePrivateRequest(
  actor: User,
  requestId: string,
  pointId: string,
  client: PoolClient,
): Promise<ChargingAllocation>
```

Caller phải dùng actor được backend xác thực, có role operator, và truyền client đang ở trong `Database.transaction`. Không mở transaction con; lỗi phải được truyền ra để caller rollback. Nếu caller đã khóa tài nguyên trước, cũng tuân thủ thứ tự Hub → xe → yêu cầu → cổng. Caller xử lý retry serialization/deadlock ở ranh giới transaction; không bắt lỗi rồi commit các bước còn lại.

Các điều kiện được kiểm tra trong cùng transaction:

- Yêu cầu tồn tại và là xe cá nhân, Hub còn active.
- Xe vẫn thuộc người gửi và vẫn chiếm chỗ vật lý tại đúng Hub.
- Pin hiện tại có dữ liệu và thấp hơn mục tiêu khi cấp mới.
- Cổng cùng Hub, không failed và còn available khi cấp mới.
- Request còn queued và chưa có active session.

Khi thành công: cổng `occupied` → yêu cầu `allocated` → tạo phiên `scheduled`. `occupied` ở cổng có nghĩa đã được giữ/cấp cho một phiên active, chưa khẳng định pin đang tăng. T19 mới bắt đầu sạc. Partial unique indexes sẵn có bảo vệ một active session cho mỗi point/request, một active request cho mỗi xe.

Gọi lại cùng request/point đang allocated với phiên scheduled/charging hợp lệ trả cùng session; không tạo phiên thứ hai. Gọi request đã được cấp sang cổng khác trả 409. Lỗi sau khi đổi trạng thái point/request phải rollback cả hai cùng session. Check-out cũng khóa Hub/xe: nếu allocation thắng thì check-out bị chặn; nếu check-out thắng thì yêu cầu cancelled và allocation bị từ chối.

Lỗi domain: 403 sai role; 404 request/point không tồn tại; 409 tài nguyên hoặc trạng thái không phù hợp. SQL constraint/transaction errors phải làm rollback; chưa có endpoint HTTP allocation trong T18 để ánh xạ chúng thành response. T19 phải đặt xử lý lỗi/retry tại ranh giới transaction khi bổ sung endpoint/scheduler.

## Phần chưa triển khai / cần phối hợp

- Không có scheduler ưu tiên, API phân bổ hoặc giao diện chạy phiên. Thuộc T19.
- Không có xử lý phiên interrupted/cổng hỏng. Thuộc T20; cổng failed hiện chỉ bị chặn cấp mới.
- Service trên từ chối yêu cầu xe thuê. Cần Duy Tân cung cấp service giữ/đổi trạng thái xe dùng cùng transaction để tránh một xe được thuê trong lúc nhận phân bổ sạc. Không thay bằng cập nhật trực tiếp bảng xe thuộc module rental.
- Các phép thử nhận/trả/điều chuyển mới xác minh primitive allocation trong fixture, không chứng minh module rental/operations đã tích hợp. Chờ Duy Tân/Quỳnh Anh và bản ghép chung.
- Không hỗ trợ đặt lịch cổng sạc theo khoảng thời gian tương lai. `requiredBy` là thời điểm cần xe, không phải slot đặt cổng. T18 cấp độc quyền một cổng hiện tại tới khi workflow phiên giải phóng.
- Trước khi thay đổi hợp đồng shared hoặc chính sách giữ tài nguyên, nhóm review theo DESIGN. Không coi các lựa chọn local là đã được cả nhóm duyệt.

## Bằng chứng kiểm tra

`npm test` chạy tất cả API suites và frontend tests trên nền tích hợp. Các test PostgreSQL dùng cluster tạm, không chạm database vận hành. Kết quả trên nền tích hợp: 54 API tests và 18 frontend tests pass; chi tiết trong docs/testing.md. Số 17 tests ở bản nền cũ không đại diện nhánh tích hợp này. Group mới `T18 concurrent parking and charging allocation safety` chạy script `tests/allocation-safety-check.mjs`.

| Ca kiểm tra T18                                          | Kết quả local                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| Hai xe tranh chỗ cuối; ghi SQL cố tình trùng lịch        | Đúng một đặt chỗ thành công; SQL trùng bị constraint từ chối        |
| Hai request cùng key; một xe đặt hai Hub trùng giờ       | Cùng key trả cùng ID; xe không có hai lịch trùng                    |
| Hold còn hạn/hết hạn; xe quá giờ chưa rời                | Hold còn hạn bị giữ; hết hạn dùng được; không chiếm chỗ xe chưa rời |
| Hai yêu cầu tranh một cổng; một yêu cầu tranh hai cổng   | Chỉ một active session và một cổng bị chiếm tương ứng               |
| Gọi lại cùng request/point; ghi SQL cấp trùng point      | Trả cùng session; constraint chặn phiên trùng                       |
| Lỗi tạo session sau khi cập nhật request/point           | Cả hai trạng thái rollback, không có session                        |
| Sai role, sai Hub, point failed, Hub inactive, xe đã rời | Bị từ chối, không cấp tài nguyên                                    |
| Phân bổ đồng thời check-out                              | Chỉ một luồng thắng; trạng thái xe/chỗ/yêu cầu/cổng nhất quán       |

Kết quả local không thay thế review nhóm hoặc kiểm thử môi trường triển khai.
