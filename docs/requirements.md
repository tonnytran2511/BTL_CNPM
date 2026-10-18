# Danh sách yêu cầu ban đầu

Trạng thái: dự thảo T01 để nhóm review. Các điều kiện chưa chốt được ghi tại `guides/DESIGN.md`.

Đặc tả actor/luồng/ngoại lệ tại [use-cases.md](use-cases.md); traceability FR → UC → IT và 36 testcase dự kiến tại [integration-test-plan.md](integration-test-plan.md). Case có liên kết không đồng nghĩa đã có code hoặc đã pass.

| Mã    | Yêu cầu                                           | Phụ trách         | Bằng chứng nghiệm thu dự kiến                                           |
| ----- | ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| FR-01 | Xem Hub, xe, pin, chỗ đỗ, cổng sạc và mức sử dụng | Nhóm trưởng + TV4 | Thay đổi tài nguyên phản ánh trên danh sách/chi tiết/dashboard          |
| FR-02 | Tìm xe thuê phù hợp theo Hub, loại và pin         | TV2               | Bộ lọc trả xe đáp ứng điều kiện từ dữ liệu vận hành                     |
| FR-03 | Đặt/hủy/hết hạn đặt xe                            | TV2               | Xe được giữ và giải phóng đúng; thử đặt đồng thời không cấp trùng       |
| FR-04 | Nhận và trả xe                                    | TV2 + TV3         | Kết thúc luồng thuê; vị trí xe, chuyến đi và chỗ đỗ nhất quán           |
| FR-05 | Đăng ký xe cá nhân và đặt chỗ đỗ                  | TV3               | Đặt/hủy đúng quyền; không vượt khả năng phục vụ trong thời gian áp dụng |
| FR-06 | Yêu cầu/lập lịch sạc cho xe cá nhân và xe thuê    | TV3               | Yêu cầu vào hàng chờ; phân bổ và vòng đời phiên sạc đúng                |
| FR-07 | Ưu tiên và điều phối sạc                          | TV3               | Thứ tự/phân bổ tuân thủ quy tắc đã chốt và cấu hình                     |
| FR-08 | Quản lý Hub và tài nguyên                         | TV4               | Thay đổi cấu hình có validation; không tạo sức chứa bất hợp lệ          |
| FR-09 | Xử lý sự cố xe/cổng sạc                           | TV4 + TV3         | Tài nguyên hỏng không nhận việc; xử lý các luồng bị ảnh hưởng           |
| FR-10 | Điều chuyển xe giữa Hub                           | TV4               | Kiểm tra nguồn/đích; hoàn thành cập nhật vị trí và tài nguyên đúng      |
| FR-11 | Mô phỏng từ snapshot với đầu vào cấu hình         | TV5               | Chạy tăng nhu cầu, hết chỗ, hỏng cổng sạc; không sửa trạng thái thực    |
| FR-12 | Đánh giá tác động và đề xuất điều phối            | TV5               | Chỉ số tính từ kết quả; đề xuất có lý do và kiểm tra ràng buộc          |
| FR-13 | Đăng nhập và kiểm soát quyền theo vai trò         | Nhóm trưởng       | Backend từ chối thao tác sai quyền/người sở hữu                         |

## Yêu cầu chất lượng cần lượng hóa trước khi triển khai

- NFR-01 — Nhất quán: không cấp trùng tài nguyên hoặc vượt sức chứa trong các test đồng thời đã thiết kế.
- NFR-02 — Bảo mật: xác thực/phân quyền tại backend; không để secret trong source/log; xác định cơ chế bảo vệ phiên sau khi chọn stack.
- NFR-03 — Hiệu năng: chốt tải thử, thời gian phản hồi và chu kỳ cập nhật dashboard rồi đo trong môi trường xác định.
- NFR-04 — Dễ sử dụng: các luồng chính có trạng thái loading, empty, success/error và hướng xử lý rõ ràng.
- NFR-05 — Dễ bảo trì: UI, logic, model và data access tách biệt theo AGENTS/DESIGN.
- NFR-06 — Tái lập simulation: cùng snapshot, cấu hình và seed cho kết quả tương đương theo quy tắc đã định nghĩa.

## Điều kiện kết thúc T01/T02

Nhóm thống nhất phạm vi, actor, business rules, trạng thái, yêu cầu chất lượng kiểm chứng được, ERD/kiến trúc và hợp đồng API. Danh sách này chưa thay thế use-case diagrams hoặc đặc tả use case trong báo cáo.
