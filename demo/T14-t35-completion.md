# T14 — hoàn tất tích hợp kỹ thuật sau T35

Ngày 23/10/2026 (Asia/Ho_Chi_Minh). Phụ trách: Minh Tường; Codex thực hiện kiểm chứng và cập nhật theo yêu cầu. Base main `5d0d4d2`, gồm PR #13 của Quỳnh Anh (T35 head `ee18a06`).

**Kết luận: phần tích hợp kỹ thuật T14 đã được kiểm chứng, không còn chờ T35.** Không đồng nghĩa toàn bộ sản phẩm/tuần 2 đã hoàn thành. Demo và khả năng giải thích của từng thành viên vẫn cần chính thành viên xác nhận; không lấy kết quả của Codex thay cho nghiệm thu đó.

## Review T35 và regression

Ba điểm review ban đầu được sửa trong PR #13: xóa cổng khóa Hub → cổng → kiểm tra incident trong transaction; mutation thất bại giữ form; component chỉ hiển thị/liên kết sự kiện, hooks và model riêng. Không thay code nghiệp vụ của owner trong đợt này.

Bổ sung `tests/hub-management-check.mjs` vào foundation suite, chạy HTTP thật trên NestJS/PostgreSQL tạm. Bao gồm:

- Cả 6 mutation routes trả 401 khi chưa đăng nhập, 403 cho student.
- Tạo/sửa/xóa Hub, chuẩn hóa/trùng code, DTO và giới hạn capacity từ settings.
- Sức chứa thay đổi phản ánh ở Hub detail, danh sách student và network overview; Hub inactive bị ẩn với student và không công bố tài nguyên available.
- Hold còn hạn và lịch đỗ tương lai chặn giảm capacity; DB giữ nguyên sức chứa sau lỗi, Hub còn tham chiếu không bị xóa.
- Cổng occupied không bị xóa; cổng không có/khác Hub trả 404.
- Tái hiện interleaving cũ bằng row lock thật: incident giữ khóa cổng, HTTP DELETE đợi khóa; sau khi incident commit, DELETE phải trả 409, cổng và sự cố còn nguyên. Resolve incident rồi mới xóa thành công.
- Hub thử nghiệm tăng/giảm về 0 rồi xóa qua API; fixture test được dọn để không ảnh hưởng các kiểm tra seed/dashboard khác.

Kết quả cuối tại [execution log](../docs/test-runs/2026-10-23-t14-t35.md). Các suite rental/mobility/operations/simulation tiếp tục kiểm tra tích hợp chung; không ghi lại các thao tác browser ngày 20/10 như thể đã chạy lại trong ngày 23/10.

## Demo browser trên cùng DB tạm

Chạy `node scripts/demo-t14.mjs` sau build; runner tạo PostgreSQL, API, Vite và credentials ngẫu nhiên riêng. UI chỉ gọi API, không sử dụng fixture làm trạng thái trực tiếp.

1. Đăng nhập operator, mở Quản lý Hub; tạo Hub kiểm chứng T14.
2. Đặt sức chứa 4, thêm cổng T14-C1; reload vẫn thấy Hub, 4 chỗ và 1 cổng available.
3. Tạo trùng code: UI báo “Mã Hub đã tồn tại.” và giữ cả ba trường nhập; không còn lỗi xóa bản nháp.
4. Quay lại dashboard: thấy 3 Hub, 19 chỗ trống và 3 cổng khả dụng; Hub mới hiển thị 4/4 chỗ và 1/1 cổng. Đây là số liệu của phiên fixture này, không phải hằng số trong UI hoặc kỳ vọng bắt buộc cho dữ liệu khác.
5. Chạy simulation Hub ga Metro, 60 phút, bước 5, seed 42, nhu cầu 0.2 → 2. Snapshot `2026-10-23T04:37:31.159Z`, 1 xe đủ điều kiện; demand 6/27, served 1/1, unmet 5/26.
6. Bấm tải TXT, nhận download event, đọc file thực tế và đối chiếu Hub/tham số/kết quả; bản sao UTF-8 tại [t14-t35-simulation.txt](evidence/t14-t35-simulation.txt). Không truy cập trang trình duyệt bị chặn để lấy bằng chứng.

7. Đăng nhập student: không có điều hướng quản trị; mở thẳng `#/hubs/manage` vẫn hiển thị tổng quan student, không hiện form quản lý.

Bằng chứng: [runtime JSON](evidence/T14-t35-runtime.json), [dashboard](evidence/t14-t35-dashboard.png), [form lỗi giữ bản nháp](evidence/t14-t35-form-error.png), [phân quyền student](evidence/t14-t35-student.png). Chỉ chứa dữ liệu fixture; không có cookie, mật khẩu hoặc database URL. Ảnh và TXT là bằng chứng tĩnh, không giữ lại DB demo.

## Gate và giới hạn bàn giao

| Mục                                                                                 | Trạng thái                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T35 thiếu endpoint/UI — T14-G01                                                     | Đóng kỹ thuật: owner đã merge, regression API/DB và demo browser pass               |
| Bằng chứng TXT — T14-E01                                                            | Đóng: tải và đọc file thực tế, kết quả khớp UI                                      |
| Tài liệu — T14-D01                                                                  | Cập nhật DESIGN, UC-12, API, kiến trúc, UML, README, testing và defect log          |
| Nghiệm thu/demo của thành viên                                                      | Cần người phụ trách xác nhận riêng; chưa có bằng chứng sinh viên demo trong lần này |
| Audit log chung, xử lý cam kết khi Hub inactive                                     | Chưa triển khai trong T35; giữ rõ trong UC-12                                       |
| UI sự cố/điều chuyển, scheduler/phiên sạc, hoàn tất điều chuyển, simulation mở rộng | Phạm vi T19–T22/T37, chưa nghiệm thu ở đây                                          |
| T16 PR #14                                                                          | Chưa tích hợp trong bản kiểm chứng này                                              |

AI: Codex hỗ trợ review, viết regression, thao tác UI/API trên môi trường tạm và soạn bằng chứng/tài liệu. Minh Tường và owner cần review, hiểu và giải thích phần bàn giao. Báo cáo ngày 20/10 được giữ làm lịch sử, không sửa thời gian hoặc nâng kết quả cũ thành bằng chứng mới.
