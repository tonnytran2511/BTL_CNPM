# Quy tắc làm việc trong dự án

Trước mọi thay đổi, đọc file này và `docs/guides/DESIGN.md`.

## Cấu trúc code

- Component/page chỉ chứa UI: hiển thị, props và liên kết sự kiện với handler.
- Logic giao diện và gọi API nằm trong hooks; API client tách riêng.
- Model/type tách khỏi component; nghiệp vụ và quy tắc trạng thái nằm trong backend services/domain.
- Truy cập database và transaction nằm trong lớp data access phù hợp với stack đã chọn.
- Utils chứa hàm tính toán thuần, không kiêm truy cập dữ liệu hoặc điều phối nghiệp vụ.
- Backend là nơi quyết định quyền truy cập, khả năng đặt tài nguyên và chuyển trạng thái.

## Dữ liệu động

- Không hardcode Hub, xe, tên người dùng, sức chứa, trạng thái vận hành hoặc kết quả simulation trong UI.
- Tham số nghiệp vụ lấy từ cấu hình có kiểm tra hợp lệ; seed dùng để tạo dữ liệu giả lập, không thay thế nguồn dữ liệu vận hành.
- Không ghi secret vào source; cung cấp biến môi trường mẫu khi triển khai.

## Tích hợp và bàn giao

- Thống nhất model, trạng thái, đơn vị đo, thời gian và hợp đồng API trước khi tích hợp module.
- Module khác sử dụng service/API đã thống nhất; không tự cập nhật dữ liệu thuộc module khác.
- PR nêu yêu cầu liên quan, thay đổi và kết quả kiểm thử; cập nhật tài liệu khi thay đổi hợp đồng hoặc quy tắc.
- Task hoàn thành khi code đã review/tích hợp, kiểm tra phù hợp đã pass và tài liệu liên quan được cập nhật.
- Báo cáo phải khai báo việc dùng AI; mỗi thành viên hiểu và giải thích được phần mình.

## Trạng thái hiện tại

Stack đã chốt: React + TypeScript + Vite, NestJS + TypeScript và PostgreSQL. Simulation là module TypeScript trong backend. Nền tảng đã có code; các quy tắc nghiệp vụ mở rộng còn ghi rõ trạng thái đề xuất trong DESIGN và tài liệu bàn giao.
