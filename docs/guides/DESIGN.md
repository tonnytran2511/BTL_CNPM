# Smart E-Mobility Hub — định hướng thiết kế

Trạng thái: nền tảng đã triển khai; thiết kế nghiệp vụ của các module thành viên tiếp tục được review.
Nguồn: `Assignment_SoftwareEngineering_HK261.pdf` và `Guideline and Rubric.pdf`.

## Phạm vi

Hai vai trò chính: sinh viên và người vận hành. Quản lý mạng lưới Hub, thuê xe dùng chung, đỗ/sạc cho xe cá nhân, sự cố, điều chuyển và What-if Simulation. Dữ liệu vận hành có thể giả lập.

Trong kế hoạch hiện tại, thanh toán, IoT thật, bản đồ 3D, mobile riêng và dự báo ML nằm ngoài phạm vi. Đây là quyết định phạm vi của nhóm, không phải yêu cầu loại trừ trong đề bài.

## Phân quyền sở hữu module

| Vai trò     | Module và trách nhiệm                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| Nhóm trưởng | Nền tảng, auth/phân quyền, API client, dashboard, kiến trúc, dữ liệu chung và tích hợp |
| TV2         | Vehicle, reservation, trip; vòng đời thuê xe                                           |
| TV3         | Private vehicle, parking, charging; phân bổ chỗ đỗ/cổng sạc                            |
| TV4         | Quản trị Hub/tài nguyên, incident, redistribution, lịch sử vận hành                    |
| TV5         | Snapshot, scenario, simulation engine, impact metrics, recommendations                 |

Tên TV2–TV5 chỉ mô tả vai trò; không dùng làm định danh người dùng trong hệ thống.

## Kiến trúc dự kiến

Frontend → API → services/domain → data access → database.

- Frontend gồm UI, hooks, model/type và API client tách biệt.
- Backend triển khai theo module trong cùng một ứng dụng để giảm chi phí tích hợp.
- Auth kiểm tra danh tính và quyền tại backend; các service kiểm tra quyền sở hữu tài nguyên.
- Dashboard đọc trạng thái tổng hợp từ API; polling là phương án ban đầu, chu kỳ cập nhật cấu hình được.
- Simulator lấy snapshot chỉ đọc; chạy trên trạng thái riêng và lưu kết quả riêng.
- Đề xuất simulation không tự thay đổi vận hành. Khi thực thi, tạo lệnh nghiệp vụ và kiểm tra lại điều kiện hiện tại.

Stack: React + TypeScript + Vite; NestJS + TypeScript; PostgreSQL. Data access dùng `pg` và migration SQL, chưa dùng ORM. Workspace chia `apps/web`, `apps/api`, `packages/contracts`.

Xác thực: session opaque, token ngẫu nhiên chỉ nằm trong cookie HttpOnly/SameSite Strict; database lưu SHA-256 của token, thời hạn và user. Mật khẩu dùng scrypt với salt riêng. Logout xóa session; mỗi request đọc quyền hiện tại từ user đang active. Mutation kiểm tra Origin; login có rate limit cấu hình được. Bản hiện tại chỉ có đăng nhập tài khoản được cấp qua seed, chưa có đăng ký/quên mật khẩu.

Hợp đồng endpoint đã triển khai tại `docs/api.md`; ERD/kiến trúc tại `docs/architecture.md`; hướng dẫn mở rộng tại `docs/guides/CONTRIBUTING.md`.

### Lý do chọn stack

Người dùng đã xác nhận frontend/backend và cho phép triển khai PostgreSQL cùng simulation TypeScript:

| Phần       | Đề xuất                                                      | Lý do và đánh đổi                                                                                                                                             |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend   | React + TypeScript + Vite                                    | UI theo component; tách hooks/model; Vite có template React/TypeScript. Cần nhóm quen React và TypeScript.                                                    |
| Backend    | NestJS + TypeScript                                          | Cấu trúc module/controller/service phù hợp phân công nghiệp vụ; dùng chung ngôn ngữ với frontend. Cần học dependency injection và quy ước Nest nếu chưa quen. |
| Database   | PostgreSQL                                                   | Phù hợp dữ liệu quan hệ và ràng buộc tài nguyên; hỗ trợ transaction/isolation. Chống xung đột vẫn cần thiết kế constraint/transaction và xử lý retry phù hợp. |
| Giao tiếp  | REST API; polling cấu hình được                              | Dễ mô tả hợp đồng và kiểm thử; chu kỳ cập nhật cần đo và chốt.                                                                                                |
| Simulation | Module TypeScript trong backend, engine tính toán tách riêng | Dùng snapshot và model chung; có thể kiểm thử độc lập với HTTP/database.                                                                                      |

Hiện dùng CSS thuần và Node test runner cho integration test. SQL nằm trong repositories; migration quản lý schema tường minh để các thành viên đọc và bổ sung ràng buộc transaction. Chưa triển khai production/deployment.

Tài liệu chính thức đã đối chiếu:

- Vite: https://vite.dev/guide/
- NestJS: https://docs.nestjs.com/
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html

## Các ranh giới cần bảo vệ

- TV2 gọi service parking để nhận/trả xe; không tự trừ/cộng sức chứa Hub.
- TV4 gọi các service tài nguyên để điều chuyển; không sửa trực tiếp trạng thái xe hoặc chỗ đỗ.
- TV3 sở hữu trạng thái cổng/phiên sạc và xử lý ảnh hưởng khi cổng sạc hỏng; TV4 phối hợp ghi nhận sự cố.
- TV5 dùng snapshot có hợp đồng dữ liệu rõ ràng từ các module; không đọc/ghi tùy tiện database vận hành.
- Việc giữ tài nguyên và chuyển trạng thái liên quan phải nguyên tử; phương án transaction/locking phụ thuộc database được chọn.

## Quy tắc nền tảng cần thống nhất

1. Một xe không được cấp đồng thời cho hai lượt đặt/thuê còn hiệu lực.
2. Tổng tài nguyên đang chiếm và đang giữ hợp lệ không vượt sức chứa theo quy tắc thời gian đã chốt.
3. Một cổng sạc không phục vụ các phiên xung đột; cổng hỏng không nhận phiên mới.
4. Mọi chuyển trạng thái có điều kiện và actor được phép; sai trạng thái phải bị từ chối.
5. Request gửi lặp không tạo chuyến đi, phiên sạc hoặc lệnh hoàn thành trùng.
6. Thời gian lưu trữ/API có múi giờ rõ ràng; frontend định dạng khi hiển thị.
7. Sức chứa, ngưỡng pin, thời hạn giữ xe, trọng số ưu tiên sạc và tham số mô phỏng lấy từ dữ liệu/cấu hình.

## Các quyết định còn mở

Baseline cụ thể cho các lựa chọn nghiệp vụ tại `docs/business-rules.md`; checklist review tại `docs/leader-review.md`. Các baseline này phục vụ triển khai và chờ review thành viên, không tự coi là cả nhóm đã duyệt. `packages/contracts/planned.ts` chứa kiểu request/response đề xuất; endpoint tương ứng chưa có code.

- Chọn môi trường triển khai dùng chung; local đã có Docker Compose hoặc embedded PostgreSQL.
- Chọn trạng thái và chuyển trạng thái của từng entity.
- Đặt xe có đồng thời giữ chỗ tại Hub đích hay không; xử lý Hub đích đầy khi trả xe.
- Đặt đỗ/sạc dùng khoảng thời gian nào; cách phân biệt chỗ trống, đang chiếm và đang giữ.
- Quy tắc ưu tiên sạc, chống chờ vô hạn và xử lý phiên bị gián đoạn.
- Giả định simulation: bước thời gian, nhu cầu, thời gian đi/sạc và cách đánh giá đề xuất.
- Hợp đồng API: ID, thời gian, đơn vị, mã lỗi, phân trang, version trạng thái nếu cần.

## Kiểm chứng thiết kế

Kiểm tra luồng bình thường, sai quyền, hết hạn, xung đột đồng thời, Hub đầy, cổng sạc hỏng và request lặp. Với simulation, kiểm tra kết quả tái lập theo đầu vào/seed và dữ liệu vận hành không bị đổi.

Use case, kiến trúc, ERD và sơ đồ hành vi phải được cập nhật theo triển khai thực tế. Các chỉ tiêu phi chức năng chỉ được đánh dấu đạt khi có phép đo hoặc bằng chứng kiểm tra.
