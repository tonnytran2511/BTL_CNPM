# Kiểm chứng ứng viên tích hợp T08 — 20/10/2026

Phụ trách tích hợp: Minh Tường. Giữ commit gốc PR #8 của Duy Tân (`25cf60a`), ghép lên nền T15 sau PR #10. Nhánh `codex/integrate-t08`; log này mô tả ứng viên tích hợp, không xác nhận sinh viên đã peer review hoặc toàn bộ T23 hoàn thành.

## Thay đổi khi review/tích hợp

- Giữ module operations, simulation và UI mới của main; giữ API client có deadline/error code, dashboard session-expiry/retry và bộ runner tìm mọi API suite khi giải quyết conflict.
- Chuyển orchestration nhận/trả vào useRental, chọn Hub đích vào useTripTarget. useTrips dùng generation để phản hồi mutation phiên cũ không đặt lỗi, ghi gợi ý hoặc mở khóa mutation phiên mới.
- Hiển thị mọi chuyến active, chọn đích riêng theo tripId. API trả mọi active cộng tối đa 100 completed mới nhất để chuyến cũ chưa trả không bị lịch sử che mất. Không tự thêm rule giới hạn một chuyến/người.
- Gợi ý Hub dùng settings.returnHubSuggestionLimit, migration mới 004 giữ baseline 5; không sửa migration đã chia sẻ. ErrorFilter chỉ chuyển tiếp details của 4xx, không lộ nội dung nội bộ 5xx; client giữ cả code và details.
- Khóa Hub trước xe/chỗ để phối hợp caller Hub-first. Nhận xe kiểm tra lại expires_at sau chờ khóa bằng clock_timestamp(), tránh dùng now() cố định từ BEGIN để nhận xe đã quá hạn. Tự động expire/giải phóng vẫn thuộc T16.

## Kiểm tra tự động

Môi trường macOS, Node 25.9.0, npm 11.12.1; dependency theo lockfile; PostgreSQL tạm riêng, Nest HTTP thật. Fixtures không dùng database vận hành.

- `npm run build`: frontend/backend pass; `npm test`: 77/77 API và 28/28 frontend pass; `npm run format:check` và `git diff --check`: pass. Số API bao gồm các parent test của Node runner.
- `tests/trip.test.mjs`: quyền/DTO/trạng thái; nhận/trả/cùng transaction; thao tác lặp; pickup đồng thời; đích đầy/inactive và lịch tương lai; hai xe tranh chỗ cuối. Bổ sung kiểm tra hai active cùng tài khoản khi có 101 completed mới hơn, số lượng gợi ý thay đổi theo DB và cấu hình sai; caller giữ Hub vẫn khóa được xe trong lúc pickup/return đang đợi Hub; chờ khóa vượt expires_at bị 409 và không tạo trip/giải phóng chỗ.
- `apps/web/src/hooks/trips.test.ts`: lỗi mutation từ tài khoản cũ không ảnh hưởng mutation tài khoản mới, chặn submit lặp, gợi ý gắn đúng trip, giữ mọi active và Hub đích riêng từng chuyến/reset khi đổi user.
- Error filter/client tests kiểm tra gợi ý 409 đi cùng HTTP code và details 5xx bị che. Giữ các regression của T15, mobility, rental và operations.

## Kiểm tra browser → API → PostgreSQL

15:10–15:11 (Asia/Ho_Chi_Minh): IAB mở Vite nối Nest/PostgreSQL tạm riêng. Đăng nhập operator fixture, tìm/đặt/nhận DORM-B01 và METRO-B01 trên UI. Màn hình hiển thị “Đang thuê 2 xe”, hai chọn Hub đích độc lập và hai nút trả. Chọn đích chéo rồi trả lần lượt: còn 1 rồi 0 chuyến; lịch sử đủ cả hai hành trình. Xe sẵn sàng 2 → 0 → 2, chỗ trống 15 → 17 → 15. Query DB sau UI xác nhận hai trip completed, hai xe available ở Hub đích tương ứng. Không có error/warn console trong luồng này.

Ảnh bằng chứng local: `/tmp/cnpm-t15-evidence/two-active-trips.jpg`, `trips-completed.jpg`, `trips-history.jpg`; không commit ảnh. Fixture API/Vite/DB được dừng và dọn sau phiên kiểm tra. Kiểm tra browser trước bổ sung recheck expiry cuối cùng; logic recheck được xác minh riêng bằng API/PostgreSQL test có chờ khóa.

## Giới hạn và bàn giao

Không có telemetry/hao pin cuối chuyến; chưa có scheduler expiry T16, kiểm tra lại pin sau khi giữ xe hoặc Idempotency-Key tổng quát T17. Không mở rộng sang scheduler sạc, Hub CRUD hoặc hoàn tất điều chuyển. Chưa đo tải/NFR hoặc xác nhận hoàn tất T23/T25. Minh Tường/Duy Tân cần review kết quả và giải thích quy tắc trước nghiệm thu.

AI: code gốc T08 có hỗ trợ Claude theo tác giả PR; Codex hỗ trợ giải quyết conflict, sửa tích hợp, kiểm thử và cập nhật tài liệu theo yêu cầu Minh Tường. Xem [nhật ký AI](../ai-usage.md).
