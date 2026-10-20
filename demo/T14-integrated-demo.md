# T14 — demo tích hợp lần 1 và bàn giao

Thực hiện bù mốc D7 ngày **20/10/2026**, khoảng 15:35–15:40 (Asia/Ho_Chi_Minh). Phụ trách: Minh Tường; kiểm tra do Codex thực hiện theo yêu cầu. Bản ứng dụng: main `435f7a0` sau PR #11, gồm auth/dashboard, mobility, rental T08, operations T12 và simulation T13/UI PR #9.

**Trạng thái: đã chuẩn bị bản tích hợp, chạy demo phạm vi hiện có và cập nhật tài liệu; T14 chưa được nghiệm thu đầy đủ vì T35 còn chờ.** Minh Tường đã chọn hoàn thiện T14 và ghi rõ phụ thuộc T35; không triển khai thay T35 trong đợt này. Không dùng kết quả này để xác nhận T23/T25 hoặc các module tuần 2 đã xong.

## Chạy lại

1. `npm ci`, `npm run setup:env`, sau đó `npm run demo:t14`.
2. Dùng URL/cổng và tài khoản student/operator được in trong terminal. Đây là credentials ngẫu nhiên của database tạm, không phải tài khoản vận hành.
3. Dữ liệu lấy từ seed JSON, sau đó UI gọi API/DB thật. Chọn Hub/xe đang khả dụng trong lần seed hiện tại; không phụ thuộc UUID trong bằng chứng dưới đây.
4. Ctrl+C để dừng và dọn môi trường. Kết quả demo không tồn tại sau khi dọn; bản ghi trong repository là bằng chứng tĩnh của phiên cụ thể.

## Kịch bản và kết quả đã chạy

| Bước | Thao tác / mong đợi                                                  | Bằng chứng thực tế                                                                                                                                              |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Đăng nhập student, xem Hub/dashboard; không thấy điều hướng operator | Chrome hiển thị đúng role; 2 Hub, 2 xe sẵn sàng và 15 chỗ trống theo fixture                                                                                    |
| 2    | Đăng ký xe cá nhân và đặt lịch đỗ tương lai                          | DEMO-T14-PRIVATE, pin khai báo 25%; lịch 15:37–16:07 tại Hub ga Metro/P10. Chỗ vật lý vẫn trống khi chỉ đặt lịch                                                |
| 3    | Thử check-in trước giờ                                               | UI từ chối “Lịch chưa đến giờ, đã hết hạn hoặc không thể check-in”; không chiếm chỗ                                                                             |
| 4    | Tìm → đặt → nhận → trả xe thuê trên cùng DB                          | DORM-B01 rời Hub ký túc xá rồi trả về Hub ga Metro; history completed. Allocation không dùng P10 đã hứa cho lịch cá nhân; network parking 15 → 16 → 15          |
| 5    | Check-in đúng giờ, gửi yêu cầu sạc                                   | P10 chuyển occupied cho xe cá nhân; availableParking 15 → 14. Request target 80% thành queued; cổng sạc không tự bị cấp vì scheduler chưa có                    |
| 6    | Reload trang                                                         | Session, xe cá nhân, booking checked_in, queue và lịch sử chuyến vẫn đọc từ DB                                                                                  |
| 7    | Operator tạo/resolve sự cố và tạo/hủy lệnh pending                   | Qua HTTP API trên cùng instance; actor lấy từ session, incident resolved, order cancelled; totals không bị đổi bởi lệnh pending/cancel. T12 chưa có UI quản trị |
| 8    | Operator chạy mô phỏng tăng nhu cầu                                  | Snapshot `2026-10-20T08:38:24.238Z`; 60 phút, bước 5, seed 42, rate 0.2 → 2. Ban đầu 2 xe đủ điều kiện; demand 6/27, served 2/2, unmet 4/25, còn 0/0            |
| 9    | Kiểm tra mô phỏng không ghi vận hành                                 | Hash SHA-256 trước/sau của 13 bảng nghiệp vụ khớp; booking vẫn checked_in và request vẫn queued                                                                 |
| 10   | Xóa kết quả                                                          | Kết quả biến mất; thời lượng form vẫn 60; không thay đổi DB                                                                                                     |
| 11   | Student check-out                                                    | Booking completed, space available/private_vehicle_id null, request queued chuyển cancelled; network parking 14 → 15                                            |

Bằng chứng máy đọc được: [T14-runtime.json](evidence/T14-runtime.json), gồm timestamp, mã bản ứng dụng, IDs fixture, kết quả API/DB và hash trước/sau. Không chứa cookie, mật khẩu hoặc connection string. Hash so sánh loại users/sessions vì đổi tài khoản tạo/thu hồi session là hành vi được phép.

Ảnh Chrome: [đỗ và queue sạc](evidence/t14-parking-charging.jpg), [simulation](evidence/t14-simulation.jpg), [check-out](evidence/t14-checkout.jpg). Không có recording video tổng hợp mới trong lần này. [Báo cáo/recording TV5 ngày 19/10](D7-report.md) là bằng chứng riêng T13, không thay cho demo toàn nhóm.

## Gate và phần còn chờ

| Phụ thuộc / output T14                          | Kết luận                                                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bản thuê xe, đỗ và queue, simulation chạy chung | Đã tích hợp PR #11 vào main; demo trên cùng instance/DB riêng như trên                                                                                                                       |
| Nhất quán tài nguyên/quyền/rollback             | Kiểm tra API/frontend tự động tại testing.md; demo bình thường không thay thế mọi interleaving đồng thời                                                                                     |
| Use case, sơ đồ/thiết kế và defect log          | Đã cập nhật phạm vi có code/chưa có code, ranh giới module và quan hệ dữ liệu; xem [use-cases](../docs/use-cases.md), [architecture](../docs/architecture.md), [defects](../docs/defects.md) |
| T35 quản lý Hub/cấu hình tài nguyên             | Chưa có code/PR; còn chờ Quỳnh Anh, không nghiệm thu đủ gate T14                                                                                                                             |
| Demo/review của thành viên                      | Chưa có xác nhận từng người hiểu và demo phần mình; kết quả do Codex thực hiện được ghi riêng                                                                                                |
| TXT simulation                                  | Đã bấm nút nhưng công cụ không nhận download event; xác minh file tải chưa đạt. Trình duyệt chặn trang chrome://downloads; không kết luận đây là lỗi ứng dụng                                |

T19/T20 scheduler/phiên sạc, T21 hoàn tất điều chuyển và T22 ba kịch bản/lưu lịch sử là phạm vi tuần 2; demo hiện tại không tuyên bố những phần này đã có. Thời gian chờ check-in dùng đồng hồ thật; không sửa starts_at bằng SQL để biến bước browser thành pass.

## AI và bàn giao

Codex hỗ trợ rà tích hợp, thao tác Chrome/API trên fixture riêng, runner demo, bằng chứng và tài liệu. Minh Tường và owner cần đọc, review, demo lại và giải thích trước nghiệm thu. Không ghi kết quả chạy ngày 20/10 như thể đã chạy đúng deadline 19/10.
