# T19 — điều phối sạc xe cá nhân

Trạng thái: đã triển khai và kiểm thử local; chưa review/tích hợp vào main.

## Luồng sử dụng

Sinh viên đăng ký xe, đặt chỗ, check-in tại Hub và gửi yêu cầu sạc như trước.
Người vận hành đăng nhập, mở mục quản lý sạc, chọn Hub và phân bổ cổng.
Chỉ yêu cầu còn queued, xe đúng chủ và đang đỗ thực tế tại Hub hoạt động, pin dưới mục tiêu mới đủ điều kiện.
Sau phân bổ, phiên ở scheduled; người vận hành bắt đầu để chuyển charging.
Khi hoàn tất hoặc hủy phiên đang chạy, nhập mức pin thực tế quan sát được trong dữ liệu giả lập.
Hoàn tất yêu cầu pin đạt mục tiêu. Hủy phiên chưa chạy không thay đổi pin.
Các thao tác kết thúc cập nhật phiên, yêu cầu, pin và giải phóng cổng trong cùng transaction.

## Ưu tiên đề xuất cần nhóm review

Yêu cầu chờ quá chargingMaximumWaitMinutes đứng trước theo FIFO, tránh bị lùi liên tục.
Tiếp theo là yêu cầu cần xe trong chargingUrgencyWindowMinutes, rồi xe pin dưới lowBatteryThreshold, rồi các yêu cầu còn lại.
Trong cùng nhóm, so thời hạn, pin, thời điểm gửi và ID để kết quả xác định.
Các ngưỡng đọc từ settings có kiểm tra hợp lệ; thiếu cấu hình thì báo lỗi, không dùng giá trị ẩn trong UI.
Seed minh họa thêm chargingMaximumWaitMinutes=120 và chargingUrgencyWindowMinutes=60; chạy lại db:seed để bổ sung cấu hình còn thiếu. Seed không ghi đè cấu hình đã có.

## Hợp đồng API

Tất cả đường dẫn bắt đầu /api/mobility/charging và chỉ dành cho operator.
Mọi POST cần header Idempotency-Key (1–128 ký tự); gửi lại cùng khóa/nội dung trả lại kết quả đã lưu, dùng khóa với nội dung khác trả 409.

| Method | Đường dẫn              | Body / kết quả                                                                                  |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | /overview              | {queue, sessions}; chỉ các yêu cầu xe cá nhân đủ điều kiện; phiên đang hoạt động hiển thị trước |
| POST   | /schedule              | {hubId}; phân bổ tối đa số cổng khả dụng, trả {sessions}                                        |
| POST   | /sessions/:id/start    | {}; scheduled → charging                                                                        |
| POST   | /sessions/:id/complete | {achievedBatteryPercent}; charging → completed, yêu cầu fulfilled                               |
| POST   | /sessions/:id/cancel   | {}; scheduled → cancelled; phiên charging cần achievedBatteryPercent                            |

Sai quyền: 403; không đăng nhập: 401; DTO/pin không hợp lệ: 400; thiếu tài nguyên: 404; trạng thái hoặc tài nguyên đã thay đổi: 409.
Không có tiến trình tự tăng pin hoặc tự phân bổ theo chu kỳ; operator chủ động phân bổ và xác nhận pin. Chưa phải tích hợp thiết bị thật.

## Kiểm chứng

npm.cmd test: 59 kiểm thử backend và 18 kiểm thử frontend pass trên nền main c73dabe + T18.
Kiểm thử PostgreSQL/HTTP riêng xác nhận quyền operator, ưu tiên quá hạn, một cổng cho nhiều yêu cầu, gửi lặp, bắt đầu/kết thúc/hủy, pin không hợp lệ và hoàn tất/hủy đồng thời chỉ một bên thành công.
Các kiểm thử frontend hiện có pass; chưa kiểm thử trực quan thủ công màn hình mới.

## Phần chờ tích hợp

Chỉ xử lý xe cá nhân. RentalService đã có; còn chờ hợp đồng giữ/đổi trạng thái xe thuê cùng transaction từ module thuê xe của Duy Tân.
T20 cần thống nhất với Quỳnh Anh cách bàn giao sự cố cổng và transaction cho thao tác gián đoạn/đưa lại hàng chờ. Chưa gọi riêng createIncident rồi cập nhật phiên bằng transaction khác.
Không sửa thay module rental hoặc operations. Chưa thể coi toàn bộ T19/T20 của nhóm đã hoàn tất.

## Khai báo AI

Codex hỗ trợ triển khai, viết kiểm thử và tài liệu. Thành viên cần đọc, giải thích quy tắc ưu tiên, transaction và giới hạn trên trước khi bàn giao.
