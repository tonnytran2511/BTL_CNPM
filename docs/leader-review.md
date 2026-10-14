# Review và bàn giao của nhóm trưởng

## Tình trạng thực tế

- Nền tảng có code và đã kiểm chứng local; auth, dữ liệu Hub, dashboard, snapshot, migration/seed hoạt động.
- AuthModule/HubsModule đã tách file và export service; AppModule chỉ lắp ráp các module.
- Database.transaction cung cấp transaction ghi dùng chung; readSnapshot giữ transaction read-only.
- AllocationPort là interface cho TV3, chưa có provider. Planned API types không đồng nghĩa endpoint đã triển khai.
- Quy tắc v1 tại business-rules.md là baseline cần các thành viên review; chưa ghi nhận cả nhóm đã thông qua.
- Không đánh dấu task được peer review/merge nếu chỉ có kiểm tra của Codex.

## Review ngắn trong tuần thi

Nhóm trưởng đọc theo thứ tự: README → DESIGN → business-rules → api → architecture. Mỗi thành viên chỉ cần review BR và contract của module mình trong một buổi ngắn.

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

Remote/CI URL và bằng chứng clone sạch được cập nhật sau khi publish. Không đưa .env, cluster local, build output hay hai PDF đề bài vào repo public.
