# Review và bàn giao của nhóm trưởng

## Trạng thái bàn giao 28/10/2026

Các module tuần 2 đã tích hợp trong main `376b160`; xem [báo cáo](reports/system-report.md), [execution T23/T29](test-runs/2026-10-28-release.md) và [gate/bàn giao](reports/week2-week3-delivery.md). Nội dung bên dưới giữ lịch sử review nền tảng, không thay trạng thái mới. Diff candidate vẫn cần peer review sinh viên.

## Tình trạng thực tế (lịch sử nền tảng)

- Nền tảng có code và đã kiểm chứng local; auth, dữ liệu Hub, dashboard, snapshot, migration/seed hoạt động.
- AuthModule/HubsModule đã tách file và export service; AppModule chỉ lắp ráp các module.
- Database.transaction cung cấp transaction ghi dùng chung; readSnapshot giữ transaction read-only.
- AllocationPort đã có provider thật trong MobilityModule của Mai Anh tuần 1 (local, chờ review/tích hợp). Hợp đồng endpoint mobility thực tại docs/api.md; planned types khác không đồng nghĩa endpoint đã triển khai.
- Quy tắc v1 tại business-rules.md là baseline cần các thành viên review; chưa ghi nhận cả nhóm đã thông qua.
- Không đánh dấu task được peer review/merge nếu chỉ có kiểm tra của Codex.

## Review ngắn trong tuần thi

Nhóm trưởng đọc theo thứ tự: README → DESIGN → business-rules → api → architecture. Mỗi thành viên chỉ cần review BR và contract của module mình trong một buổi ngắn.

Review tiếp `docs/use-cases.md` và testcase của module tại `docs/integration-test-plan.md`. Có 15 UC, hai sơ đồ UML source và 36 case kế hoạch; chưa ghi nhận các case này đã chạy. Chủ module xác nhận các quyết định mở và phản hồi expectation trước khi tích hợp.

| Người  | Cần phản hồi cụ thể                                                    | Bằng chứng chốt                                             |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Leader | Ranh giới module, auth, transaction, cách giữ chỗ khi nhận/trả         | Comment/PR hoặc biên bản quyết định trong repo              |
| TV2    | BR-01/02/03/09/10/11; reservation/trip DTO; service xe cho điều chuyển | State machine + response/error + test xung đột dự kiến      |
| TV3    | BR-02–08/11; AllocationPort; lịch tương lai so với chỗ vật lý          | API/service signatures + schema booking/session + test slot |
| TV4    | BR-08–11/15; lifecycle incident/redistribution                         | Luồng nguồn/đích, sự cố/hủy và log vận hành                 |
| TV5    | BR-13–15; inputs/metrics; snapshot mở rộng                             | Giả định simulation, công thức chỉ số và test tái lập       |

## PR đầu tiên cho từng module

- TV2: model/migration reservation-trip, lọc xe; kế tiếp mới đặt/nhận/trả.
- TV3: migration booking/request/session và AllocationPort thực; để TV2/TV4 tích hợp sớm.
- TV4: Hub CRUD/validation; sau đó incident/redistribution khi service xe/parking đã có.
- TV5: engine thuần với snapshot fixture và input/seed; sau đó persistence/UI. Không ghi vào vận hành.

PR nhỏ theo một luồng, không đợi hết module mới ghép. Chủ module chạy build/format/test phù hợp trước khi gửi; leader kiểm tra contract/schema/transaction, rồi người khác chạy lại luồng chính.

## Gate tích hợp 26/10

- Mọi người clone, tạo .env riêng, migrate/seed và chạy được.
- Không có logic nghiệp vụ trong component hoặc dữ liệu demo cố định trong UI.
- Hợp đồng API, migration và service allocation được ghép trước các luồng phụ thuộc.
- Demo thuê xe/đỗ-sạc cơ bản và simulation đầu tiên trên cùng bản tích hợp.
- Lỗi có người xử lý; trạng thái chưa có code được ghi minh bạch.

## Quy trình Git dự kiến

Main chứa bản chạy được; branch feature/<module>-<task> dùng cho triển khai. Mở PR vào main, dùng PR template, CI pass và ít nhất một người review trước merge. Chưa cấu hình branch protection trên GitHub; phải kiểm tra cài đặt repo sau khi tạo, không coi đây là rule server đã được bật.

Repository public: https://github.com/tonnytran2511/BTL_CNPM. Remote local dùng SSH; README có URL HTTPS để clone.

CI commit nền tảng `2f22bef` đã pass trên Ubuntu/Node 22: checkout, npm ci, setup env, format, build và integration test. Bằng chứng: https://github.com/tonnytran2511/BTL_CNPM/actions/runs/38594291555.

Danh sách publish đã được kiểm tra không chứa mật khẩu `.env`; .env, cluster local, build output và hai PDF đề bài được giữ ngoài repo public. Chưa có branch protection hoặc lời mời thành viên; chờ username để mời đúng người.

## Xác nhận nhóm và phần việc tiếp theo — 15/10/2026

Nhóm trưởng xác nhận cả nhóm đã đồng ý T01–T05 (phạm vi/yêu cầu, baseline thiết kế, setup và nền tảng hiện có); đã cập nhật trên bảng phân công. Xác nhận này thay cho trạng thái chờ phản hồi ở thời điểm soạn baseline, không có nghĩa PR #1 đã merge hoặc endpoint dự kiến đã có code.

T15/T29 được bổ sung regression tests và sửa lifecycle dashboard trong branch `feat/dashboard-reliability`; xem execution log tại `docs/test-runs/2026-10-15-foundation-dashboard.md`. Cần review code mới, kiểm tra trình duyệt và tích hợp API của thành viên trước khi đánh dấu hoàn thành.
