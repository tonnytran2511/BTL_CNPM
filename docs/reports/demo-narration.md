# Lời dẫn video demo 3 phút

Bản quay thực trên Chromium/DB tạm. Giọng đọc tổng hợp macOS Linh, nội dung do Codex hỗ trợ soạn theo implementation; không giả giọng thành viên. Các cảnh rút ngắn thời gian chờ, không đổi đồng hồ hoặc trạng thái DB để vượt điều kiện nghiệp vụ. Phụ đề SRT đi kèm video.

## 00:00–00:30 — Thuê và trả xe

Đây là bản demo Smart E-Mobility Hub trên dữ liệu giả lập riêng. Sinh viên chọn xe còn trống, đặt giữ rồi nhận xe. Khi trả tại Hub khác, backend kiểm tra sức chứa và cập nhật chuyến đi cùng chỗ đỗ trong một transaction. Lịch sử hiển thị đúng nguồn, đích và pin của xe. Mọi dữ liệu trên màn hình được đọc qua API.

## 00:30–01:00 — Xe cá nhân và đặt đỗ

Sinh viên đăng ký xe cá nhân rồi chọn Hub và khoảng thời gian đỗ. Lịch phải ở tương lai. Đoạn chờ đến giờ đã đặt được rút ngắn trong video; hệ thống chỉ cho check-in khi đến giờ thật. Check-in xác nhận xe chiếm chỗ vật lý; check-out giải phóng chỗ và kết thúc lịch. Backend kiểm tra chủ sở hữu và xung đột tài nguyên.

## 01:00–01:40 — Sạc và phục hồi sự cố

Người vận hành gửi yêu cầu sạc cho chính chiếc xe vừa trả. Bộ điều phối xếp hàng theo cấu hình, giữ cổng và tạm ngừng cấp xe thuê. Khi báo hỏng cổng, phiên bị gián đoạn; pin quan sát được giữ và nhu cầu chưa đạt quay lại hàng chờ. Sau xác nhận sửa xong, hệ thống tạo phiên mới. Hoàn tất với pin thực tế đạt mục tiêu sẽ giải phóng cổng và xe trong cùng transaction. Pin được nhập từ dữ liệu quan sát của demo, không tự tăng theo thời gian.

## 01:40–02:10 — Điều chuyển và nhật ký

Người vận hành chọn Hub nguồn, Hub đích và xe khả dụng để tạo lệnh. Bắt đầu lệnh giữ xe ở trạng thái đang điều chuyển. Hoàn tất sẽ kiểm tra lại nguồn, sự cố và chỗ đích trước khi cập nhật xe cùng nhật ký. Mỗi sự kiện ghi người thực hiện và thời điểm. Regression còn kiểm tra đích đầy phải rollback và không tạo nhật ký hoàn tất giả.

## 02:10–03:00 — Ba kịch bản What-if

Cuối cùng, người vận hành so sánh ba tình huống: nhu cầu lấy xe tăng, chỗ đỗ bị chiếm thêm và cổng sạc hỏng. Mỗi lần chạy lưu snapshot, seed, tham số, phiên bản mô hình và kết quả riêng. Bảng so sánh thể hiện số phục vụ, từ chối hoặc hàng chờ theo từng tài nguyên. Có thể mở lịch sử và tải báo cáo TXT. Runner đọc lại cả ba file tải xuống và xác minh dữ liệu Hub không đổi sau mô phỏng. Đề xuất chỉ để tham khảo; muốn thực hiện phải tạo lệnh vận hành và kiểm tra trạng thái hiện tại. Mô hình chưa hiệu chuẩn theo nhu cầu thực tế. Video và báo cáo có khai báo việc dùng AI.
