# Execution 29/10/2026 — bộ bàn giao có demo quay sẵn

Môi trường: macOS, Node 25.9.0; Chromium của Playwright 1.62.1; PostgreSQL embedded 18 trên cluster tạm. Mỗi lượt runner tạo ports/tài khoản/password riêng và dọn DB khi kết thúc. Không dùng DATABASE_URL vận hành hoặc profile Chrome cá nhân. Minh Tường cho phép Playwright riêng; Codex thực thi và review kỹ thuật.

## Kiểm tra lại

- `npm run build`: pass trước quay.
- `npm test`: 130 backend, 62 frontend pass, 0 fail.
- Năm cảnh quay đều không có pageerror, kết quả tại `demo/evidence/week23/recorded-ui-verification.json`.
- Thuê/trả cùng một xe: chuyến completed và Hub đích đúng khi đọc API.
- Xe cá nhân: đăng ký, đặt lịch tương lai, chờ đúng đồng hồ thật, check-in và check-out qua UI. Script CI bổ sung đối chiếu booking completed qua API.
- Xe thuê đó: request/schedule/start → fail cổng/requeue → repair → phiên mới/start/complete; pin quan sát 100 và xe quay lại kết quả tìm kiếm.
- Điều chuyển xe đó: create/start/complete, order completed và có audit qua API.
- Chạy cả demand_surge/parking_full/charging_failure; bắt download thật và đọc TXT lần lượt 2777/2946/3772 bytes, kiểm tra model resource-flow-v1. Mở history và so sánh toàn bộ Hub trước/sau không đổi. W23-E01 đóng.

Các lần xây runner trước đó dừng vì locator label bao gồm hint/options hoặc lịch được đặt ở quá khứ. Đã sửa selector và chờ lịch thật; không ghi đây là defect ứng dụng hoặc sửa business rule để demo vượt điều kiện. Lần quay đầy đủ sau sửa pass cả năm cảnh; không đưa clip thất bại vào video cuối.

## Đầu ra

Video H.264/AAC 1280×720, khoảng 180 giây; có giọng đọc tổng hợp macOS Linh và SRT. Scene 30/30/40/30/50 giây. Chỉ quay sau đăng nhập; giữ bản raw trong .local, video local theo .gitignore. Không quay terminal, cookie, mật khẩu hoặc DB URL. Lời dẫn và khai báo AI ở docs/reports/demo-narration.md.

Báo cáo PDF có sáu sơ đồ tích hợp và hai use case, nguồn chỉnh sửa Markdown/Mermaid/PlantUML cùng SVG vector chi tiết. Slide final 10 trang với speaker notes, ở slide 9 phát MP4 đi kèm. Kiểm tra package/layout/import bằng artifact-tool và xem ảnh render; không tuyên bố đã kiểm tra bằng native PowerPoint.

CI Ubuntu/Node 22 của head 5ae8381 đã pass build/format/130 backend/62 frontend trên host riêng. Workflow mới thêm Chromium và runner năm luồng, artifact ghi hình giữ riêng. Kết quả máy CI không thay buổi rehearsal, peer review của sinh viên hoặc nghiệm thu máy chiếu. Không có biên nhận nộp chính thức.

## CI và sửa teardown sau lần quay

Head 478d3d7 có CI Ubuntu pass cả build/test và năm luồng Chromium. Head e47870a chỉ đổi phân trang PDF nhưng một job tái hiện race teardown của fixture T17: 12 ca con pass, sau đó idle pg.Pool phát 57P01 khi dừng cluster. W23-R03 sửa chờ API exit trước pool/DB, chỉ chấp nhận mã administrative shutdown sau bắt đầu cleanup; mọi idle error khác vẫn làm fixture fail. T05/T07/T08 cùng mẫu được chỉnh tương ứng. Bốn suite liên quan chạy đồng thời có 49 tests pass, 0 fail. Bản video không cần quay lại vì thay đổi chỉ ở fixture, không thay hành vi runtime.
