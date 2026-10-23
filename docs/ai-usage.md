# Nhật ký hỗ trợ AI

23/10/2026: Theo yêu cầu Minh Tường hoàn tất sau T35, Codex review bản PR #13 đã merge, thêm regression HTTP/PostgreSQL (đặc biệt incident/delete đồng thời), chạy build/test và demo UI trên DB tạm; xác minh TXT tải thực tế, lưu ảnh/báo cáo và cập nhật tài liệu T14. Không triển khai thay T16/T19–T22/T37, không tự xác nhận peer review hoặc khả năng giải thích của thành viên.

20/10/2026: Theo yêu cầu Minh Tường làm T14, Codex tích hợp PR #11, chạy demo Chrome trên Nest/Vite/PostgreSQL riêng cho thuê xe, đặt/check-in/out, queue sạc và simulation; kiểm tra API T12 và hash 13 bảng trước/sau simulation. Bổ sung runner demo database tạm, báo cáo T14, bằng chứng JSON, defect/gap log và cập nhật use case/thiết kế. Minh Tường chọn ghi T35 là phụ thuộc còn chờ, không triển khai thay owner; chưa nghiệm thu đủ T14. Không xác nhận video, peer review hoặc TXT download khi chưa có bằng chứng.

20/10/2026: Theo yêu cầu Minh Tường thực hiện task tuần 2 từ bảng phân công, Codex hỗ trợ T15: rà polling/auth/error, xác minh danh tính/role trước refresh, xử lý dashboard 403 và sự kiện online, che message nội bộ 5xx; bổ sung regression tests frontend và kiểm tra API/PostgreSQL xuyên module đặt/hủy xe. Codex hỗ trợ soạn execution log và phần báo cáo tuần 2 T24, ghi rõ các gate T23/T25 chưa đủ điều kiện. Kiểm thử tự động không thay thế peer review, demo và khả năng giải thích của Minh Tường; không tự cập nhật tiến độ bảng Google Sheets.

14/10/2026: Codex hỗ trợ dự thảo yêu cầu/thiết kế, đề xuất stack, khởi tạo code nền tảng, migration/seed, auth/dashboard và integration test. Nội dung trong repository được AI tạo/chỉnh sửa với chỉ dẫn của nhóm trưởng.

Nhóm cần tự review, chỉnh sửa và chạy lại; ghi rõ các phần đã được thành viên kiểm tra hoặc phát triển thêm. Không coi nhật ký này là khai báo báo cáo cuối đã hoàn tất, và không khẳng định review của sinh viên khi chưa thực hiện.

15/10/2026: Codex hỗ trợ soạn 15 use case, hai source UML use-case diagram, kế hoạch 36 testcase tích hợp và traceability. Đây là tài liệu thiết kế/test plan; chưa phải bằng chứng chạy case hoặc review của sinh viên.

15/10/2026: Codex hỗ trợ T15/T29: sửa lifecycle polling/session/chi tiết Hub, giữ mã lỗi API, thêm test frontend với Vitest/jsdom và regression test quyền tài khoản trên PostgreSQL thật; ghi execution log. Nhóm trưởng đã xác nhận cả nhóm đồng ý phần T01–T05 trước thay đổi này. Code bổ sung trong branch dashboard vẫn cần review; không coi xác nhận cũ là review code mới.

15/10/2026: Codex tiếp tục thêm deadline request từ cấu hình công khai, kiểm thử timeout/cancellation/recovery, session rotation/hash/cookie và rate limit trên API instance riêng. Kiểm tra Chrome mất kết nối/phục hồi bằng mô phỏng mạng riêng cho tab, sau đó trả mạng về bình thường. Cập nhật yêu cầu Node >=22.13 cho dependency test; code mới vẫn chờ review.
15/10/2026: Theo yêu cầu của Mai Anh, Codex hỗ trợ viết code local T09–T11: migration đỗ/sạc, MobilityModule/service allocation, API client/hooks/UI, test tích hợp và tài liệu. Đồng thời sửa cấu hình UTF-8 khi tạo PostgreSQL local trên Windows và retry cleanup test. Chưa commit/push GitHub theo yêu cầu của Mai Anh; chưa có peer review/merge. Mai Anh cần đọc, chạy demo và giải thích được phần mình trước bàn giao.

17/10/2026: Theo yêu cầu Minh Khuê, Codex hỗ trợ T13: hợp đồng demand simulation, engine, validation/API, hook/UI, test và tài liệu giả định. Minh Khuê cần review, demo và giải thích model trước bàn giao; chưa coi là peer review hay phê duyệt giả định của nhóm.

17/10/2026: Codex hỗ trợ yêu cầu Minh Khuê tách trang mô phỏng, thêm điều hướng và hướng dẫn sử dụng tiếng Việt trong ứng dụng.

17/10/2026: Codex chuyển hướng dẫn thành popup trên trang simulation theo yêu cầu Minh Khuê, bổ sung giải thích seed cạnh ô nhập.

17/10/2026: Theo yêu cầu Minh Khuê, Codex tinh chỉnh layout simulation, bỏ nút đóng trùng và helper seed, thêm tải báo cáo TXT từ kết quả hoàn thành.

17/10/2026: Codex tách thiết lập cơ bản/nâng cao, seed mặc định 42 theo yêu cầu Minh Khuê và thêm nút về đầu trang.

17/10/2026: Codex giữ thanh điều hướng khi cuộn và bỏ nút về đầu trang theo yêu cầu Minh Khuê.

17/10/2026: Theo yêu cầu Minh Khuê, Codex bỏ mục thu gọn nâng cao, hiển thị trực tiếp Seed mặc định 42 với ghi chú ngắn.

17/10/2026: Codex thêm nút ngẫu nhiên tham số simulation theo yêu cầu Minh Khuê, tuân thủ giới hạn API và giữ Hub/kết quả cũ.

18/10/2026: Codex hỗ trợ nhóm trưởng giải quyết conflict và tích hợp tài liệu use case với main sau T13; giữ nguyên lịch sử hỗ trợ AI của các module.

18/10/2026: Codex hỗ trợ giải quyết conflict PR #2 sau T13, ghép API client có deadline dùng chung, giữ onRetry/session-expiry ở chi tiết Hub và chạy lại build/API/frontend tests. Không coi kiểm tra tự động là demo UI của sinh viên.

18/10/2026: Codex hỗ trợ nhóm trưởng tích hợp PR #6 với main sau #1/#2/#5; sửa hàm format trùng, tách orchestration/xác nhận khỏi UI, ngăn phản hồi mutation cũ ảnh hưởng phiên mới và bổ sung regression tests. Tác giả cần demo và giải thích phần T07.

18/10/2026: Codex hỗ trợ nhóm trưởng giải quyết conflict PR #7 với #1/#2/#5/#6, tách DTO/repository/service, chuyển cập nhật trạng thái xe qua RentalService trong cùng transaction, từ chối description trắng bằng 400 và thêm test PostgreSQL/HTTP cho T12/rental concurrency/rollback. Cập nhật tài liệu phạm vi chưa triển khai; không khẳng định peer review/demo của thành viên.

20/10/2026: Codex tiếp tục kiểm tra T15 trong IAB với Nest API/PostgreSQL tạm riêng: đặt/hủy, polling tự nhận thay đổi DB và đổi role operator về student làm UI reset. Đã dọn fixture; không dùng dữ liệu vận hành. Kiểm tra này không thay cho peer review/demo của thành viên.

20/10/2026: Theo yêu cầu tiếp tục của Minh Tường, Codex rà và chuẩn bị tích hợp PR #8/T08 lên nền T15: giải quyết conflict giữ nguyên simulation/dashboard/operations, tách điều phối và lựa chọn Hub khỏi UI, bảo vệ generation của mutation, hiển thị mọi chuyến active, cấu hình số Hub gợi ý và khóa Hub trước xe. Codex bổ sung test browser/API/PostgreSQL, cập nhật contract/sequence và ghi giới hạn. Giữ tác giả commit gốc T08; phần sửa tích hợp cần Minh Tường/Duy Tân review và giải thích.
