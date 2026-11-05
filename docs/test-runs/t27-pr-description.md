# T27: kiểm thử chéo Simulation với đỗ/sạc và bảo vệ dữ liệu vận hành

Bổ sung oracle chỉ số sạc và kiểm thử HTTP/PostgreSQL cho ba scenario T22: projection loại booking/hold/cổng sự cố, các bảng vận hành bất biến, history giữ snapshot cũ, đề xuất có giới hạn và điều chuyển từ đề xuất cũ phải kiểm lại reservation/capacity hiện tại. Ánh xạ IT-32–36 theo integration-test-plan; không thay mô hình hoặc quy tắc vận hành.

Sửa lỗi dừng demo Windows bằng private IPC để chạy cleanup, đồng thời giới hạn số suite PostgreSQL chạy song song để tránh vượt deadline do tranh tài nguyên. Kết quả build/test và log trước/sau tại `2026-11-05-t27-cross-simulation.md` và `t27-evidence/validation.json`.

Codex hỗ trợ code/test/tài liệu theo yêu cầu Mai Anh. Chờ thành viên review, demo và giải thích; chưa merge/push.
