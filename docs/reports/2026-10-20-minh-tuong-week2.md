# Báo cáo phần Minh Tường — tuần 2, cập nhật 20/10/2026

Phạm vi căn cứ bảng phân công: T15 (20–23/10), phần leader trong T23 (24–25/10), T24 (20–25/10) và chuẩn bị gate T25 (26/10). Đây là bản nháp bàn giao theo code hiện có, chưa xác nhận cả tuần hoặc feature freeze hoàn thành.

## T15 — dashboard, lỗi API và quyền

Dashboard nhận trạng thái động từ backend qua polling có cấu hình; không lưu bản sao trạng thái nghiệp vụ trong component. `useFoundation` điều phối refresh, xác minh `/auth/me`, gọi overview/list theo vai trò; API client quản lý deadline/cancellation. `useHubDetail` đọc chi tiết khi có kỳ cập nhật mới, không hủy request chậm chỉ vì dashboard vừa poll. Backend kiểm tra session và role ở từng endpoint, service giữ quyền sở hữu và quy tắc nghiệp vụ, repository giữ SQL/transaction.

Đợt này bổ sung xử lý thay danh tính/role và 403 để xóa cache; thử refresh khi mạng trở lại; che message nội bộ 5xx, giữ envelope và thông báo validation 4xx. Không thêm endpoint, migration hoặc dữ liệu vận hành cố định vào UI. Giữ dữ liệu thành công gần nhất khi lỗi tạm, có timestamp/cảnh báo để người dùng biết đang xem dữ liệu cũ.

Kiểm chứng: build pass; 57 tests API và 23 tests frontend pass. API thực xác nhận luồng tìm → đặt → đọc dashboard/detail/list → hủy → số liệu khôi phục. Chi tiết và defect đã sửa tại [execution log T15](../test-runs/2026-10-20-t15-dashboard.md). Browser–API–PostgreSQL riêng đã kiểm tra đặt/hủy, polling tự nhận thay đổi và reset khi đổi quyền; đây là kiểm tra của Codex, chưa thay cho demo/peer review của sinh viên.

## T24 — liên kết thiết kế và bằng chứng phần leader

| Nội dung                                                 | Tài liệu / bằng chứng                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| FR-01/FR-13, UC-01/02/11                                 | [Yêu cầu](../requirements.md), [use case](../use-cases.md)                                          |
| UI → hooks → API → services → repositories → PostgreSQL  | [Kiến trúc và sequence T15](../architecture.md), [DESIGN](../guides/DESIGN.md)                      |
| Cookie session, quyền backend, lỗi và chính sách refresh | [API contract](../api.md)                                                                           |
| Test tự động và giới hạn                                 | [Execution T15](../test-runs/2026-10-20-t15-dashboard.md), [test plan](../integration-test-plan.md) |
| Hỗ trợ AI                                                | [Nhật ký AI](../ai-usage.md)                                                                        |

Không suy từ test tự động ra kết quả đo hiệu năng, demo hay xác nhận của thành viên. ERD và các phần nghiệp vụ do owner hoàn thiện tiếp theo implementation của họ; báo cáo này chỉ bàn giao phần leader.

## T23/T25 — các mục cần kiểm tra khi module được tích hợp

| Hạng mục                   | Hiện trạng ở base main sau PR #9                                                                  | Owner / việc tiếp theo                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Dashboard/auth, lỗi/quyền  | Có code, test tự động và kiểm tra browser T15; cần review/tích hợp và xác nhận Minh Tường         | Minh Tường                                                    |
| Thuê xe xuyên module       | Tìm/đặt/hủy đã tích hợp; nhận/trả ở PR #8, chưa có trong base                                     | Duy Tân + Minh Tường review/tích hợp; sau đó test IT-11–16    |
| Đỗ/sạc                     | Đăng ký/lịch/check-in/out/yêu cầu có code; scheduler và vòng đời phiên chưa có                    | Mai Anh T18–20; kiểm tra chỗ/sạc đồng thời và cổng hỏng       |
| Hub/vận hành               | T12 mới ghi nhận/resolve sự cố và tạo/start/cancel lệnh; Hub CRUD và hoàn tất điều chuyển chưa có | Quỳnh Anh T35/T21/T37; kiểm tra đích đầy và log               |
| Simulation                 | departures-v1, kịch bản tăng nhu cầu; PR #9 bổ sung UI/báo cáo demo riêng TV5                     | Minh Khuê T22/T36; thêm ba kịch bản, lịch sử và test          |
| Demo D14 và feature freeze | Chưa đủ đầu vào để xác nhận đầy đủ phạm vi                                                        | Minh Tường và owner đối chiếu requirements/rubric sau T23/T24 |

Giữ các mục chưa có code là chưa kiểm chứng. Chưa tuyên bố T23 pass toàn hệ thống hoặc T25 feature-complete; cần ghi defect theo bước tái hiện, mong đợi/thực tế, mức độ, owner và retest khi ghép bản ứng viên. Chưa cập nhật trạng thái hay phần trăm trên Google Sheets.

AI: Codex hỗ trợ triển khai, kiểm tra và soạn bản nháp này theo yêu cầu Minh Tường. Minh Tường cần đọc, chỉnh sửa, demo và giải thích phần mình; chưa có xác nhận peer review của thành viên khác.
