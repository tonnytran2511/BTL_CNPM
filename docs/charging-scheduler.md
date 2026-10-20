# T19 — điều phối sạc xe cá nhân và xe thuê

Trạng thái: đã triển khai local, chờ review/tích hợp vào main. Ngày 20/10/2026, Mai Anh cho phép chủ động bổ sung tích hợp module thuê xe.

## Luồng sử dụng

Sinh viên đăng ký xe cá nhân, đặt chỗ, check-in tại Hub và gửi yêu cầu sạc như trước.
Người vận hành đăng nhập và mở **Điều phối sạc**. Để sạc xe thuê, chọn xe từ danh sách dữ liệu thực, nhập pin mục tiêu và thời điểm cần xe tùy chọn, gửi yêu cầu; sau đó chọn Hub để phân bổ cổng.
Xe thuê phải available, đang chiếm chỗ tại đúng Hub hoạt động, không có lượt đặt hoặc chuyến đi active; pin mục tiêu phải cao hơn pin hiện tại.
Yêu cầu queued chưa giữ xe. Nếu xe được đặt thuê/điều chuyển trước khi phân bổ, yêu cầu không đủ điều kiện sẽ tạm bị loại khỏi hàng ưu tiên; operator có thể hủy trong danh sách yêu cầu xe thuê còn chờ. Hủy yêu cầu queued không sửa trạng thái xe đang được module khác sử dụng.

Khi phân bổ, xe thuê đổi available → charging ngay khi phiên scheduled được tạo, để giữ xe trong lúc chờ bắt đầu. Xe tiếp tục chiếm chỗ đỗ tại Hub.
Bắt đầu chuyển phiên scheduled → charging; trạng thái xe vẫn charging.
Hoàn tất/hủy phiên đang chạy cần nhập pin thực tế quan sát từ dữ liệu giả lập. Hoàn tất phải đạt mục tiêu; hủy không được làm pin giảm. Hủy phiên chưa chạy không thay đổi pin.
Kết thúc phiên giải phóng cổng và chuyển xe charging → available trong cùng transaction với pin và trạng thái yêu cầu/phiên. available không đảm bảo thuê được: ngưỡng minimumRentalBatteryPercent và Hub active vẫn áp dụng qua service thuê xe.
Không tự tăng pin theo thời gian; không tự phân bổ cổng theo chu kỳ; operator chủ động xác nhận.

## Hợp đồng giữa module

MobilityModule import RentalModule; RentalModule export RentalChargingService. Service này sở hữu kiểm tra, giữ và giải phóng trạng thái xe thuê, dùng RentalRepository với PoolClient của caller. Không mở transaction riêng và không commit riêng.
ChargingAllocationService.allocateRentalRequest(actor,requestId,pointId,client) khóa Hub → xe thuê → request → point, kiểm tra lại rồi giữ xe, cổng và tạo phiên nguyên tử.
Khóa Hub dùng FOR NO KEY UPDATE để tuần tự hóa mutation mà không chặn FK KEY SHARE lúc module thuê xe tạo reservation. Xe dùng FOR UPDATE và cập nhật có điều kiện.
Nếu tạo/kết thúc phiên lỗi, caller rollback toàn bộ; không để xe charging mà chưa có phiên, không giải phóng xe khi phiên chưa kết thúc. Key gửi lại có thể retry khi transaction trước thất bại.
Không thêm hay sửa migration đã chia sẻ; sử dụng trạng thái/bảng hiện có.

## Chính sách ưu tiên đề xuất cần review

Áp dụng chung cho yêu cầu xe cá nhân và xe thuê đủ điều kiện. Yêu cầu chờ quá chargingMaximumWaitMinutes đứng trước theo FIFO để tránh bị lùi liên tục.
Tiếp theo: cần xe trong chargingUrgencyWindowMinutes, rồi pin dưới lowBatteryThreshold, rồi các yêu cầu còn lại. Trong cùng nhóm so thời hạn, pin, thời điểm gửi, ID.
Ngưỡng lấy settings có kiểm tra hợp lệ; thiếu cấu hình báo lỗi. Seed minh họa maximumWait=120 phút và urgencyWindow=60 phút, không ghi đè cấu hình đã có.

## API

Các endpoint quản lý dưới /api/mobility/charging chỉ dành cho operator. POST cần Idempotency-Key 1–128 ký tự. Cùng khóa/nội dung trả kết quả đã lưu; đổi nội dung cùng khóa trả 409.

| Method | Đường dẫn              | Body / kết quả                                                                                                            |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | /overview              | {queue,sessions,rentalCandidates,rentalPending}; queue/session có vehicleKind private hoặc rental                         |
| POST   | /requests              | Endpoint tạo yêu cầu đã có: {hubId,vehicle:{kind:"rental",id},targetBatteryPercent,requiredBy?}; operator tạo cho xe thuê |
| POST   | /requests/:id/cancel   | Hủy yêu cầu xe thuê còn queued; không thay đổi trạng thái xe                                                              |
| POST   | /schedule              | {hubId}; trả {sessions}, phân bổ theo ưu tiên tối đa số cổng trống                                                        |
| POST   | /sessions/:id/start    | {}; scheduled → charging                                                                                                  |
| POST   | /sessions/:id/complete | {achievedBatteryPercent}; charging → completed; request fulfilled                                                         |
| POST   | /sessions/:id/cancel   | {}; scheduled → cancelled; phiên đang charging cần achievedBatteryPercent                                                 |

401 chưa đăng nhập, 403 sai quyền, 400 DTO/pin không hợp lệ, 404 thiếu tài nguyên, 409 sai trạng thái/xung đột/khóa gửi lại khác nội dung.
API tạo yêu cầu hiện có vẫn cho sinh viên tạo cho xe cá nhân của mình. Backend từ chối sinh viên gửi cho xe thuê.

## Kiểm thử và giới hạn

Kiểm thử PostgreSQL/HTTP riêng bao gồm: quyền, vị trí, xe reserved/in_use/charging/maintenance/redistributing, active reservation/trip, replay, bắt đầu/hoàn tất/hủy, pin thấp vẫn không thuê được, lỗi tạo phiên và lỗi sau cập nhật pin đều rollback; đặt thuê/điều chuyển cạnh tranh với phân bổ sạc; hoàn tất/hủy cạnh tranh chỉ một thao tác thành công; hủy queued không ghi đè reserved.
Kiểm thử hook UI bao gồm: quyền operator, Hub từ xe được chọn, deadline có múi giờ, dùng lại key khi mạng lỗi, đổi phiên đăng nhập khi mutation đang chờ.
Không kiểm thử thiết bị thật; chưa kiểm tra trực quan thủ công toàn màn hình mới. Kết quả chạy đầy đủ ghi tại testing.md.

## T20 còn riêng

Tích hợp sạc xe thuê không còn chờ Duy Tân. Phần sự cố cổng, interrupted và đưa lại hàng chờ thuộc T20, chưa triển khai trong thay đổi này; còn cần thống nhất transaction sự cố. Không tự chuyển xe maintenance hoặc khôi phục khi có sự cố.

## Khai báo AI

Codex hỗ trợ code, kiểm thử và tài liệu; Mai Anh cần đọc và giải thích quy tắc ưu tiên, khóa dữ liệu và giới hạn trước khi bàn giao.
