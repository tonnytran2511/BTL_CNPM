# Bàn giao tuần 2 và phần Minh Tường tuần 3

Đối chiếu bảng Công việc ngày 28/10/2026: T15–22, T36–37 đã hoàn thành/merge trước phiên này; công việc còn lại tuần 2 là T23–25. Phần Minh Tường tuần 3 là T29, T32–34; phần Cả nhóm T30/T31 được chuẩn bị đầu vào, không nhận thay xác nhận của chủ việc.

Nguồn bảng: https://docs.google.com/spreadsheets/d/1z_K4Uaoy2dUGKJMkAiStlnrZ-ia73v0YJb8wn87KDRo/edit?gid=1474635418#gid=1474635418. Ngày bắt đầu/deadline là kế hoạch nội bộ, không phải hạn nộp chính thức. Không sửa lịch hay tự ghi xác nhận nộp.

## Gate kỹ thuật và việc cần con người xác nhận

| Task          | Đầu ra bàn giao                                                                                                           | Kết luận phù hợp bằng chứng                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| T15–22/T36–37 | Module trong main `376b160`, regression cũ + tích hợp mới                                                                 | Đã có implementation trước đợt này; giữ owner theo bảng                                                      |
| T23           | `tests/release-check.mjs`, execution mới, 64 assertion quyền, chuỗi thuê/sạc/hỏng/điều chuyển, traceability và defect log | Đã kiểm tra kỹ thuật phạm vi trong log; nghiệm thu/kiểm thử chéo sinh viên chưa có xác nhận                  |
| T24           | `system-report.md`, architecture/use-cases/ERD/class/activity/sequence/state, rubric map                                  | Có báo cáo nháp đầy đủ theo code; còn thành viên đọc/giải thích trước bản cuối T30                           |
| T25           | Baseline freeze và backlog bên dưới, bằng chứng Chrome                                                                    | Bản ứng viên đủ luồng đã kiểm tra; không backdate demo D14, không giả nhận nghiệm thu                        |
| T29           | Regression quyền/tích hợp, review ranh giới và regression sửa lỗi tài liệu                                                | Đã chuẩn bị bản ổn định kỹ thuật; phụ thuộc T26–28/T38 cần chủ việc xác nhận kiểm thử chéo, D17 do nhóm demo |
| T32           | Slide riêng và phân vai 20 phút, lời dẫn và checklist rehearsal                                                           | Tài liệu trình bày đã chuẩn bị; chưa ghi rằng đã rehearsal hoặc mỗi người đã giải thích                      |
| T33           | `npm run verify:delivery`: cài mới/build/test trong thư mục cô lập; manifest source/docs/evidence                         | Kiểm tra trên cùng host; cần chạy trên máy khác và bổ sung video trước gọi bộ nộp hoàn chỉnh                 |
| T34           | Checklist nộp và mục bằng chứng chờ bên dưới                                                                              | Chưa nộp: thiếu cổng/hạn chính thức và xác nhận của người nộp                                                |

## Baseline đóng băng ứng viên

Feature baseline là main `376b160` (PR #18) cộng regression/tài liệu của `codex/week2-week3-delivery`. Không thêm feature trong đợt bàn giao. Sửa blocker có bước tái hiện, owner, test hồi quy và review trước ghép. Không sửa migration đã chia sẻ để làm đẹp tiền tố.

Phạm vi đủ luồng kỹ thuật: auth/dashboard, rental, parking/private vehicle, charging lifecycle/failure recovery, Hub CRUD, incidents/redistribution/log, What-if/history/TXT. Phần có giới hạn giữ nguyên ở report/scenarios/use-cases và defect log. Freeze này là bản đề xuất kỹ thuật để Minh Tường nghiệm thu, không phải biên bản cả nhóm đã ký.

## Đối chiếu rubric

| Mục rubric            | Tỉ trọng | Nguồn trong bộ bàn giao                                                            |
| --------------------- | -------- | ---------------------------------------------------------------------------------- |
| Introduction          | 5%       | system-report §1                                                                   |
| Requirements Analysis | 15%      | system-report §2, requirements/business-rules/use-cases, 2 UC PlantUML             |
| Architecture          | 15%      | system-report §3.1, architecture và integrated-design sơ đồ module                 |
| Structural/Data       | 10%      | class + ERD nền tảng/tổng hợp, migration SQL                                       |
| Behavior/Interaction  | 15%      | activity sạc, sequence trip/dispatch, state reservation/trip/session/request/order |
| UI Design             | 5%       | system-report §3.4, screenshots thực và Chrome execution                           |
| Simulation            | 10%      | system-report §3.5, scenarios.md, engine tests                                     |
| Implementation        | 10%      | system-report §4, cấu trúc source, API contract                                    |
| Testing               | 10%      | integration-test-plan, execution/traceability/defects và suites                    |
| Evaluation/AI         | 5%       | system-report §6, ai-usage.md                                                      |

Không dự đoán điểm số. Các file UML nguồn cần được render khi nhóm chuyển báo cáo sang định dạng nộp, không thay bằng ảnh không đọc được. Bản Markdown có Mermaid xem được trong renderer hỗ trợ Mermaid.

## Phân vai trình bày khoảng 20 phút

| Thời gian   | Người                                   | Nội dung và điểm cần giải thích                                                          |
| ----------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| 00:00–03:00 | Minh Tường                              | Bài toán, actor/phạm vi, ranh giới module, lý do stack/transaction                       |
| 03:00–06:00 | Duy Tân                                 | Giữ/hết hạn/nhận/trả; vì sao một xe không cấp hai lượt; pin/incident và đầy đích         |
| 06:00–09:00 | Mai Anh                                 | Lịch so với chỗ vật lý, priority settings, vòng đời sạc và interrupted/requeue           |
| 09:00–11:30 | Quỳnh Anh                               | CRUD/capacity, dispatch atomic, log, giới hạn incident xe/in_progress                    |
| 11:30–14:30 | Minh Khuê                               | Snapshot read-only, ba kịch bản, conservation, seed, recommendation không giữ tài nguyên |
| 14:30–17:30 | Video quay sẵn, Minh Khuê phối hợp nhóm | Thuê/trả, đỗ/sạc, điều chuyển/sự cố và simulation theo storyboard                        |
| 17:30–20:00 | Minh Tường                              | Kết quả test đúng count, rủi ro/giới hạn, AI và kết luận; chốt trước 20:00               |

Slide tương ứng theo thứ tự: bìa, phạm vi/actor, kiến trúc, thuê xe, đỗ/sạc, vận hành, simulation, bằng chứng test, video, hạn chế/AI. Đây là phân vai đề xuất; chưa xác nhận lịch rehearsal thực tế.

## Storyboard và lời dẫn video 3 phút (đầu vào T31)

Chạy `npm run demo:t14` trên DB tạm. Chỉ quay trang sau đăng nhập, không quay terminal chứa mật khẩu/session. Có thể ghép các đoạn quay, nhưng mọi thao tác/kết quả phải là UI thật. Không dùng live demo trong buổi bảo vệ.

| Mốc       | Hình cần quay                                                                  | Lời dẫn gợi ý                                                                                                                                |
| --------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Dashboard sinh viên, chọn Hub có xe đủ pin                                     | “Hệ thống đọc xe, pin, chỗ đỗ và cổng sạc từ database. Sinh viên chỉ thấy Hub đang hoạt động.”                                               |
| 0:15–0:50 | Tìm → đặt → nhận → chọn đích → trả; history và số chỗ đổi                      | “Đặt xe giữ tài nguyên. Nhận xe giải phóng chỗ nguồn, trả chỉ hoàn tất khi cấp được chỗ đích. Gửi lặp không tạo chuyến thứ hai.”             |
| 0:50–1:25 | Xe cá nhân đăng ký → lịch/check-in → yêu cầu; operator phân bổ/start/complete  | “Lịch tương lai tách khỏi vị trí vật lý. Hàng chờ dùng ưu tiên cấu hình, pin hoàn tất do operator nhập từ quan sát.”                         |
| 1:25–2:00 | Cổng hỏng/requeue hoặc lệnh create/start/complete; log actor/time              | “Cổng hỏng không nhận phiên mới. Điều chuyển kiểm tra lại xe và chỗ, cập nhật xe/chỗ/lệnh/log trong cùng transaction.”                       |
| 2:00–2:45 | Tăng nhu cầu, baseline/scenario, đề xuất; đổi parking/failure ngắn; mở bản lưu | “Ba kịch bản chạy từ snapshot chung, seed cố định. Chỉ số và đề xuất lấy từ mô hình; trạng thái thực không đổi, thực thi phải kiểm tra lại.” |
| 2:45–3:00 | Test summary/giới hạn/AI, màn hình kết thúc                                    | “Kiểm thử và giới hạn được công bố trong báo cáo. Nhóm dùng Codex hỗ trợ và chịu trách nhiệm giải thích phần mình.”                          |

Trước quay: kiểm tra đủ xe/chỗ/cổng và policy trong DB tạm. Sau quay: xem lại 180 giây, nghe rõ giọng, kiểm tra không lộ credentials, video mở được offline; mỗi người xác nhận phần mình. **Chưa có video final được tạo/xác nhận trong đợt kỹ thuật này.**

## Checklist rehearsal và setup máy khác

1. Mỗi người mở README và chạy npm ci → setup:env → db:local (hoặc Docker) → migrate → seed → dev trên máy nhận. Ghi OS, Node/npm, commit, lỗi và ảnh thực; không chia sẻ .env.
2. Chạy npm test/build/format hoặc verify:delivery, đối chiếu execution và counts. Test DB tạm không dùng DATABASE_URL vận hành.
3. Chạy video đã quay sẵn khi offline, thử slide ở màn hình trình chiếu; đọc được chữ và sơ đồ. Dừng video trong đúng 3 phút.
4. Rehearsal toàn nhóm có bấm giờ. Minh Tường hỏi chéo: “Vì sao rollback không mất chỗ?”, “Queue có giữ xe chưa?”, “Cùng seed nhưng snapshot đổi có giống không?”, “Vì sao không áp đề xuất cũ?”. Ghi phản hồi và chỉnh slide/lời dẫn.
5. Chưa ghi pass cho máy khác hoặc rehearsal nếu chỉ chạy thư mục sạch trên cùng máy.

## Manifest và nộp bài T33/T34

Source: apps/, packages/, database/migrations/, seed.example.json, scripts/, tests/, package/lockfile, .env.example và README. Docs: system-report, use-cases/2 sơ đồ, architecture/integrated-design, business-rules, api/scenarios, test plan/execution/traceability/defects/AI. Evidence: demo/evidence/week23 và lịch sử T14. Slides: [PowerPoint cục bộ](../../demo/delivery/Smart-E-Mobility-Hub.pptx), 10 slide chỉnh sửa được với speaker notes và phân vai, đã cập nhật 130 backend + 62 frontend. Phiên mới không còn quyền mở Page slide nên bản cục bộ là bản bàn giao hiện tại. Trang video ghi rõ cần nhóm bổ sung bản quay sẵn. Video: cần nhóm quay/ghép/xác nhận theo T31.

Chỉ nhận hướng dẫn cổng nộp chính thức từ giảng viên. Trước nộp đối chiếu định dạng/tên file/link/quyền xem và deadline, xuất báo cáo/slide sang định dạng yêu cầu nếu cần; không gửi PDF đề bài hoặc .env/DB credentials vào bộ source. Mở mọi link bằng chế độ người nhận để xác minh quyền sau khi người nộp thiết lập. Không tự mở public sharing hoặc nộp vào nơi suy đoán.

Bằng chứng nộp còn trống có chủ đích: cổng nộp **chưa cung cấp**; hạn chính thức **chưa cung cấp**; người nộp/thời điểm **chưa có**; mã xác nhận/ảnh biên nhận **chưa có**. Sau khi nộp thành công, Minh Tường lưu các mục này và đọc lại danh sách file của submission. Không đánh dấu T34 hoàn thành chỉ vì bộ tài liệu đã chuẩn bị.
