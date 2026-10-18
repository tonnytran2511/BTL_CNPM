# T13 — mô phỏng tăng nhu cầu

Trạng thái: implementation trên nhánh Minh Khuê; chờ peer review/tích hợp. Giả định là baseline đề xuất, chưa phải mô hình nhu cầu thực tế đã được xác thực.

## Luồng và ranh giới

Operator → SimulationPanel → useSimulation → simulationApi → SimulationController → SimulationService → HubsService.snapshot() → engine thuần TypeScript.

SimulationRepository chỉ đọc settings. Snapshot dùng transaction read-only nhất quán của module Hub. Engine không có database, đồng hồ hoặc random toàn cục; không sửa snapshot. T13 trả kết quả trực tiếp, chưa lưu lịch sử; T22 bổ sung lịch sử và các kịch bản khác.

## Hợp đồng đã triển khai

- `GET /api/simulations/config`: operator; trả maximumSteps, maximumArrivalsPerStep, minimumBatteryPercent từ settings.
- `POST /api/simulations/demand-surge`: operator; 201, DemandSimulationResult. Request gồm hubId (UUID Hub active), horizonMinutes, stepMinutes, seed, baselineArrivalsPerStep, scenarioArrivalsPerStep. Không nhận snapshot từ client.
- Horizon/step là số nguyên phút dương; step ≤ horizon, horizon chia hết step; số bước ≤ simulationMaximumSteps.
- Seed uint32 (0–4294967295). Nhu cầu hữu hạn ≥ 0, ≤ simulationMaximumArrivalsPerStep; scenario ≥ baseline.
- Không session: 401; sinh viên: 403; DTO/tham số/Hub sai: 400; cấu hình thiếu/hỏng: 500, không fallback.
- Response gồm modelVersion, snapshotCapturedAt (ISO UTC), Hub, tham số/cấu hình đã dùng, số xe đủ điều kiện, baseline/scenario tổng hợp và timeline. Cùng snapshot + tham số + cấu hình + seed cho cùng kết quả. Request mới lấy snapshot mới.

## Giả định và công thức departures-v1

Chỉ xét nhu cầu lấy xe rời một Hub active. Xe đầu kỳ phải available và pin ≥ minimumRentalBatteryPercent từ settings. Mỗi xe phục vụ một yêu cầu rồi rời tập xe khả dụng đến hết horizon. Không tạo trip/reservation thật; không giả định điểm đến/giờ trả. Xe reserved/in_use/charging/maintenance/redistributing không tự trở lại khả dụng.

LCG uint32: `state = (1664525 × state + 1013904223) mod 2^32`, `u = state / 2^32`. Mỗi bước rút hai số u, v; nhu cầu là `floor(2 × rate × u) + I(v < fractionalPart(2 × rate × u))`. Rate có đơn vị yêu cầu trung bình/bước. Đây là phân phối giả lập biến thiên đều với làm tròn ngẫu nhiên, không phải Poisson/dữ liệu thực. Đổi step cần điều chỉnh rate tương ứng.

Hai lần chạy khởi tạo cùng seed và rút hai số mỗi bước, kể cả rate=0. Tăng rate không giảm nhu cầu tại cùng bước. `served = min(demand, availableVehicles)`, `unserved = demand − served`; xe khả dụng giảm đúng served. Tổng demand = served + unserved; xe cuối kỳ + tổng served = xe đầu kỳ đủ điều kiện. Tổng hợp tính từ diễn biến, không có kết quả cố định theo tên kịch bản.

Chưa mô phỏng hàng chờ, trả xe, parking, charging, thời gian đi và điều chuyển. Chưa công bố thời gian chờ/utilization/đề xuất khi chưa có mô hình tương ứng. T22 mở rộng và bổ sung snapshot qua service của chủ module.

## Chạy thử và kiểm chứng

Bật database, chạy `npm run db:migrate`, `npm run db:seed` để thêm cấu hình thiếu (không đổi password cũ), rồi `npm run dev`. Đăng nhập operator; chọn Hub và nhập ví dụ horizon 60 phút, step 5 phút, seed 42, baseline 0.2 và scenario 2 yêu cầu/bước. Đây là đầu vào thử, không phải nhu cầu vận hành. Xem bảng so sánh và timeline.

`npm test`: engine tái lập/không sửa snapshot, bảo toàn xe/yêu cầu, cùng rate, seed khác, fleet trống, Hub inactive/không tồn tại, pin và tham số biên; HTTP/PostgreSQL tạm kiểm tra quyền, validation, cấu hình động và bảng vận hành không đổi. `npm run build` kiểm tra frontend/backend. UI cần peer review/demo của Minh Khuê trước khi đánh dấu task hoàn tất.

## Trang và hướng dẫn sử dụng

Sau đăng nhập operator, chọn Mô phỏng trên thanh điều hướng hoặc mở /#/simulation. Nút Hướng dẫn sử dụng mở hộp thoại ngay trên trang, giải thích tham số (gồm seed), ví dụ, chỉ số, lỗi thường gặp và phạm vi mô hình. Đóng bằng nút Đóng hướng dẫn hoặc Escape; giữ nguyên ô nhập/kết quả và trả focus về nút mở. Link hướng dẫn cũ /#/simulation/guide mở trang mô phỏng. Tổng quan tại /#/. Sinh viên chỉ thấy Tổng quan, API vẫn kiểm tra quyền. Reload không lưu kết quả.

## Tải báo cáo

Sau một lần chạy thành công, nút Lưu báo cáo mô phỏng (.txt) tải file UTF-8 gồm Hub, snapshot UTC, model, tham số/cấu hình đã dùng, kết quả tổng hợp và timeline của cả baseline/scenario, cùng giới hạn mô hình. File lấy từ kết quả đã hoàn thành, không lấy từ form đang chỉnh; không chạy lại simulation hoặc lưu DB. Form chia 3 cột trên desktop, 2 trên tablet và 1 trên mobile.

## Thiết lập cơ bản và nâng cao

Form chính gồm Hub, thời lượng, bước thời gian và hai mức nhu cầu. Seed mặc định 42 theo lựa chọn người dùng, luôn hiển thị cùng các ô khác, kèm ghi chú ngắn Cài đặt nâng cao; không có mục thu gọn. Thanh điều hướng luôn hiển thị ở đầu màn hình khi cuộn; không còn nút Về đầu trang.

## Ngẫu nhiên tham số

Nút Ngẫu nhiên tham số điền lại toàn bộ ô số, giữ Hub. Bước được lấy ngẫu nhiên 1–60 phút cho lần thử, số bước nằm trong giới hạn server và bảo đảm horizon nguyên an toàn/chia hết step. Nhu cầu ban đầu/kịch bản là số nguyên trong giới hạn server, scenario ≥ baseline; seed uint32 mới. Chỉ thay form, không gọi API/chạy lại hoặc đổi báo cáo cũ. Đây là dữ liệu thử ngẫu nhiên, không phải cấu hình nhu cầu vận hành.
