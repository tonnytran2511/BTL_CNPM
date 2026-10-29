# Bàn giao tuần 2 và phần Minh Tường tuần 3

Đối chiếu bảng Công việc ngày 28/10/2026: T15–22, T36–37 đã hoàn thành/merge trước phiên này; công việc còn lại tuần 2 là T23–25. Phần Minh Tường tuần 3 là T29, T32–34; phần Cả nhóm T30/T31 được chuẩn bị đầu vào, không nhận thay xác nhận của chủ việc.

Nguồn bảng: https://docs.google.com/spreadsheets/d/1z_K4Uaoy2dUGKJMkAiStlnrZ-ia73v0YJb8wn87KDRo/edit?gid=1474635418#gid=1474635418. Ngày bắt đầu/deadline là kế hoạch nội bộ, không phải hạn nộp chính thức. Không sửa lịch hay tự ghi xác nhận nộp.

## Gate kỹ thuật và việc cần con người xác nhận

| Task          | Đầu ra bàn giao                                                                          | Kết luận phù hợp bằng chứng                                                                                |
| ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| T15–22/T36–37 | Module trong main `376b160`, regression cũ + tích hợp mới                                | Đã có implementation trước đợt này; giữ owner theo bảng                                                    |
| T23           | Regression xuyên module, execution/traceability/defect và năm luồng UI có oracle         | Hoàn tất kiểm chứng kỹ thuật; không nhận thay chữ ký kiểm thử chéo sinh viên                               |
| T24           | Báo cáo Markdown/PDF theo rubric, UML/ERD đã render, ảnh thực                            | Hoàn tất bản bàn giao kỹ thuật; các thành viên đọc và giải thích trước bảo vệ                              |
| T25           | Freeze phạm vi, demo thực quay ngày 29/10, đối chiếu rubric                              | Đã demo đủ luồng chính hiện có; không backdate thành D14                                                   |
| T29           | Ma trận quyền, revalidation, review kỹ thuật và regression lỗi shutdown/teardown         | Kiểm tra lại 130 backend + 62 frontend pass; review kỹ thuật do Codex hỗ trợ, chưa giả xác nhận T26–28/T38 |
| T32           | Slide final 10 trang, speaker notes/phân vai 20 phút, video 180 giây và SRT              | Hoàn tất tài liệu trình bày; buổi rehearsal của cả nhóm chưa diễn ra                                       |
| T33           | Script đóng gói source commit, PDF/PPTX/MP4/SRT, manifest/checksum; cài mới và CI Ubuntu | Có bộ bàn giao offline; máy CI độc lập đã build/test, còn nhóm kiểm tra thiết bị trình chiếu thực tế       |
| T34           | Checklist nộp và bộ ZIP có kiểm tra integrity                                            | Chưa nộp: cần cổng/hạn chính thức của giảng viên và biên nhận                                              |

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

Không dự đoán điểm số. Báo cáo PDF đã có sơ đồ vector; bộ SVG chi tiết ở docs/diagrams/rendered cho phép phóng to. Bản Markdown và PlantUML giữ nguyên nguồn chỉnh sửa.

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

| Mốc         | Cảnh thực                                     | Nguồn lời dẫn        |
| ----------- | --------------------------------------------- | -------------------- |
| 00:00–00:30 | Thuê/nhận/trả và history                      | demo-narration.md §1 |
| 00:30–01:00 | Xe cá nhân, đặt đỗ, check-in/out              | demo-narration.md §2 |
| 01:00–01:40 | Sạc, hỏng/requeue, repair, phiên mới/complete | demo-narration.md §3 |
| 01:40–02:10 | Điều chuyển create/start/complete và log      | demo-narration.md §4 |
| 02:10–03:00 | Ba scenario, TXT và history                   | demo-narration.md §5 |

Video final đã tạo, có SRT và giọng tổng hợp Linh. Nhóm vẫn cần xem lại cùng nhau và xác nhận khả năng giải thích trước bảo vệ.

## Checklist rehearsal và setup máy khác

1. Mỗi người mở README và chạy npm ci → setup:env → db:local (hoặc Docker) → migrate → seed → dev trên máy nhận. Ghi OS, Node/npm, commit, lỗi và ảnh thực; không chia sẻ .env.
2. Chạy npm test/build/format hoặc verify:delivery, đối chiếu execution và counts. Test DB tạm không dùng DATABASE_URL vận hành.
3. Chạy video đã quay sẵn khi offline, thử slide ở màn hình trình chiếu; đọc được chữ và sơ đồ. Dừng video trong đúng 3 phút.
4. Rehearsal toàn nhóm có bấm giờ. Minh Tường hỏi chéo: “Vì sao rollback không mất chỗ?”, “Queue có giữ xe chưa?”, “Cùng seed nhưng snapshot đổi có giống không?”, “Vì sao không áp đề xuất cũ?”. Ghi phản hồi và chỉnh slide/lời dẫn.
5. Chưa ghi pass cho máy khác hoặc rehearsal nếu chỉ chạy thư mục sạch trên cùng máy.

## Manifest và nộp bài T33/T34

Source gồm apps/, packages/, database/, scripts/, tests/, package/lockfile, .env.example và README. Docs gồm báo cáo, UML/ERD, hợp đồng API/nghiệp vụ, execution/traceability/defects/AI. Evidence tại demo/evidence/week23. Bản trình bày hiện tại là [PowerPoint final](../../demo/delivery/Smart-E-Mobility-Hub-final.pptx), 10 slide với speaker notes. Video và SRT nằm cùng thư mục demo/delivery; tại slide 9 phát MP4 đi kèm. Bản PPTX cũ giữ để truy vết lịch sử, không đưa vào ZIP final.

Chỉ nhận hướng dẫn cổng nộp chính thức từ giảng viên. Trước nộp đối chiếu định dạng/tên file/link/quyền xem và deadline, xuất báo cáo/slide sang định dạng yêu cầu nếu cần; không gửi PDF đề bài hoặc .env/DB credentials vào bộ source. Mở mọi link bằng chế độ người nhận để xác minh quyền sau khi người nộp thiết lập. Không tự mở public sharing hoặc nộp vào nơi suy đoán.

Bằng chứng nộp còn trống có chủ đích: cổng nộp **chưa cung cấp**; hạn chính thức **chưa cung cấp**; người nộp/thời điểm **chưa có**; mã xác nhận/ảnh biên nhận **chưa có**. Sau khi nộp thành công, Minh Tường lưu các mục này và đọc lại danh sách file của submission. Không đánh dấu T34 hoàn thành chỉ vì bộ tài liệu đã chuẩn bị.

## Bản thực hiện ngày 29/10/2026

`npm run demo:record` khởi tạo DB và tài khoản ngẫu nhiên riêng, dùng Chromium profile mới, quay năm luồng và xác minh kết quả qua UI/API. Không sửa đồng hồ/DB để check-in sớm. Video dựng từ các bản quay, cắt ngắn chờ đến lịch, giọng tổng hợp Linh và lời dẫn Codex có khai báo; không giả thành viên đã trình bày. TXT cả ba scenario đã đọc được. Xem execution 2026-10-29-recorded-demo.md.

Đầu ra local tại demo/delivery: Smart-E-Mobility-Hub-report.pdf, Smart-E-Mobility-Hub-final.pptx, Smart-E-Mobility-Hub-demo.mp4 và .srt. Tại slide 9, phát MP4 đi kèm; không live demo. Chạy `python3 scripts/package-delivery.py` sau commit để tạo `.local/submission/Smart-E-Mobility-Hub-submission.zip` và SHA256SUMS.txt. Bộ ZIP chỉ lấy source commit, loại .env/.local/node_modules, đối chiếu mọi payload/hash và CRC khi đọc lại. Giữ video local theo .gitignore; không đưa credentials hoặc phiên đăng nhập vào bộ nộp.

Tập dượt theo đúng phân vai ở trên, giữ mỗi người trong thời lượng, thử phát video/âm thanh offline và dùng phần hỏi đáp trong speaker notes. Việc tạo bộ tài liệu và chạy timer không chứng minh buổi tập dượt có đủ thành viên.
