# T22 — ba kịch bản và lịch sử simulation

Trạng thái: implementation local trên nền `8b93438`, chờ review/tích hợp. Đây là baseline mô hình để nhóm review, chưa hiệu chuẩn bằng nhu cầu thực tế. T19/T20/T21 cung cấp dữ liệu/workflow vận hành; simulation không gọi mutation của các workflow đó.

## Luồng và snapshot

ScenarioPanel → useScenarios → scenariosApi → SimulationController → SimulationService → engine thuần resource-flow-v1. Contract tại packages/contracts/scenarios.ts; T13/endpoint cũ giữ nguyên.

Một transaction REPEATABLE READ READ ONLY dùng chung PoolClient: HubsService trả Hub/xe/cổng và timestamp database; MobilitySnapshotService chiếu chỗ/cổng/hàng chờ; RentalChargingService chiếu xe available đủ pin, đỗ đúng Hub, không có reservation/trip active hoặc incident xe mở. Không tự expire reservation trong snapshot; xe chưa được vận hành nhả vẫn bị loại bảo thủ.

Chỗ có thể cấp loại occupied, hold còn hạn và lịch reserved/checked_in giao khoảng [snapshot, snapshot+horizon). Hold hết hạn có thể dùng. Chỗ có lịch trong horizon bị loại suốt lần chạy, kể cả sau endsAt. Không đoán giờ rời của xe đang đỗ. Cổng có incident open coi như failed. Queue hợp lệ đầu kỳ dùng điều kiện/BR-07 T19 tại snapshot; giữ thứ tự đó.

Sau tính toán, transaction riêng chỉ ghi simulation_runs: ID, actor từ session, createdAt UTC, snapshot đầy đủ, result (parameters/limits/model/timeline/impact/recommendations), retry key và payload chuẩn hóa. Không FK tới Hub để bản cũ còn đọc được sau đổi tên/xóa Hub. History không đọc lại trạng thái sống hoặc chạy lại model. Cùng actor/key/payload trả bản cũ kể cả snapshot đổi; payload khác 409; race cùng key chỉ một row. Không mutation áp dụng đề xuất/xóa history.

## Thời gian và nhu cầu

Horizon/step là số nguyên phút dương, chia hết nhau và nằm trong limits. Seed uint32. Hai nhánh dùng cùng seed LCG: state=(1664525*state+1013904223) mod 2^32; u=state/2^32. Mỗi bước rút u,v: demand=floor(2*rate*u)+I(v<fractionalPart(2*rate*u)). Luôn rút hai số kể cả rate=0. Rate là yêu cầu/bước; đổi step cần đổi rate tương ứng. Đây là giả lập đều với stochastic rounding, không phải Poisson.

Arrivals đến đầu bước (0,step,…,horizon-step); timeline ghi cuối bước (step,…,horizon). Cùng snapshot/parameters/limits/version cho kết quả khớp. Key mới lấy snapshot mới; dữ liệu/cấu hình mới có thể làm kết quả khác. Không mô phỏng hành trình xuyên Hub, thời gian đi, hao pin hoặc trả xe thuê.

## Ba kịch bản

- **demand_surge:** scenario rate ≥ baseline. Mỗi xe đủ điều kiện rời Hub tối đa một lần, không trở lại. served=min(demand,remainingVehicles); thiếu thì từ chối. Không suy diễn parking/charging utilization.
- **parking_full:** hai nhánh cùng rate. Scenario chiếm thêm additionalOccupiedSpaces đầu kỳ (1 đến số chỗ có thể cấp). Xe đến được nhận giữ chỗ hết horizon; hết chỗ từ chối, không queue. Peak parking là occupied+held đầu kỳ cộng chỗ chiếm thêm và arrivals được nhận. Chỗ hứa cho lịch tương lai bị loại khỏi free, không ghi thành occupied giả.
- **charging_failure:** hai nhánh cùng rate; chọn cổng thuộc Hub chưa failed để hỏng từ t=0. Phiên scheduled/charging đầu kỳ giả định còn đủ một chargingServiceMinutes; nếu hỏng, yêu cầu quay về queue ở t=0 với đủ service time. Không tính pin đã đạt/thời gian đã sạc; không tạo incident/session thật. Occupied không active session giữ bận cả horizon. Failed sẵn không tự hồi phục; cổng giả lập hỏng không cấp lại.

Service time sạc là tham số thử công khai, nguyên phút, chia hết step, không vượt horizon; không suy từ kW/kWh/target pin. Sau queue BR-07 đầu kỳ, arrivals tổng hợp dùng FIFO; cấp cổng theo ID ổn định. Không gán pin/deadline giả để tuyên bố đầy đủ scheduler T19. Phiên xong trả cổng ở ranh giới bước, không tăng pin thật. Queue sạc độc lập, không hứa có đủ chỗ để check-in xe mới.

## Chỉ số và bất biến

- Thuê/parking: demand=served+unserved; queued=0; resources cuối kỳ=initialResources−served. Resources không âm; parking không vượt capacity.
- Charging: demand gồm queue/active sessions đầu kỳ và arrivals; demand=served+queued; unserved=0. Served gồm active sessions đầu kỳ còn hoạt động và cấp mới. completed≤served; đang sạc cuối kỳ=served−completed. Timeline cấp mới không đếm lại active đầu kỳ.
- Utilization=busy-point-minutes/(installedPointCount*horizon)*100; cả hai dùng cùng tổng cổng lắp đặt kể cả failed. Occupied không session cũng busy; không có cổng thì 0.
- Mean wait là thời gian từ đến/createdAt tới cấp cổng, chỉ tính yêu cầu bắt đầu trong horizon, loại active đầu kỳ vì không biết thời điểm cấp gốc. Không mẫu thì null.
- Waiting at end là thời gian đã chờ trung bình của queue còn lại đến horizon, null nếu rỗng. Chưa phải thời gian đến lúc sẽ được phục vụ. Đọc cùng queued vì mean wait có thể thấp khi nhiều yêu cầu chưa bắt đầu.
- Chỉ số không áp dụng dùng null. Impact=scenario−baseline cho served/unserved/queued; chênh mean wait chỉ có khi cả hai có mẫu.

## Đề xuất, không thực thi

Khi scenario còn unserved/queued, tìm một Hub active khác theo ID ổn định. Thuê: xem xét điều chuyển không vượt eligible vehicles nguồn, chỗ có thể cấp đích và thiếu hụt. Parking: chuyển hướng không vượt chỗ có thể cấp Hub khác. Charging: gợi ý cổng available không active session/incident open; quantity là số cổng, không phải lời hứa giải quyết toàn queue. Chỉ đưa một gợi ý nguồn/đích để không hứa trùng tài nguyên.

Recommendation có reason/resource/quantity/source/target/snapshot UTC. Không có lựa chọn thì review_capacity nêu số yêu cầu thiếu, không phải số cổng cần xây. Không mô phỏng hiệu quả sau áp dụng, không tối ưu tuyến hoặc bảo đảm nhu cầu nguồn tương lai. Thực thi phải qua T19/T21 và kiểm tra lại quyền/trạng thái/pin/incident/lịch/chỗ hiện tại; không replay snapshot vào DB.

## Cấu hình và UI

Migration 007_simulation_runs.sql thêm history và settings đề xuất: simulationMaximumGeneratedRequests=100000, simulationMaximumHorizonMinutes=10080, simulationHistoryPageSize=20. Repository kiểm tra hợp lệ, không fallback. Giữ limits bước/rate/pin T13; history page size 1–100. List metadata sort created_at DESC/id DESC; detail một bản lưu không phụ thuộc cấu hình hiện tại.

Giới hạn tải kiểm tra bảo thủ `ceil(2*maxRate)*stepCount` trước khi lấy snapshot; với sạc còn kiểm tra tổng queue/active đầu kỳ cộng arrivals thực sinh. Giảm rate/horizon nếu vượt giới hạn; không cắt bớt yêu cầu rồi báo kết quả như thể đã mô phỏng đủ.

Trang Mô phỏng có dropdown chọn Mô phỏng tình huống và lịch sử hoặc Mô phỏng tăng nhu cầu (bản cơ bản). Nút hướng dẫn bản cơ bản nằm trong chính mô hình đó; UI không hiển thị mã task. Chuyển mô hình giữ form và kết quả trong phiên, không chạy lại. Default form là dữ liệu thử chỉnh được, không phải vận hành. Hub selection tải cổng; server kiểm tra lại snapshot mới. Run thành công tự lưu; lỗi tải history không biến run đã lưu thành thất bại. Mở bản cũ không dùng form đang sửa. Xóa kết quả giữ form/history; reload mất view nhưng history còn. TXT lấy từ saved result, có thiết lập bằng tiếng Việt, bảng so sánh ban đầu/khi có thay đổi, diễn biến dạng cột, gợi ý và lưu ý; không xuất JSON hoặc mã task. Chỉ số chỉ hiện khi phù hợp với kịch bản; mã đối chiếu và giới hạn nằm cuối báo cáo.

## Kiểm chứng và AI

T36 kiểm tra engine/biên/bất biến/recommendations. HTTP/PostgreSQL kiểm tra projection/history/role/DTO/retry/race/không ghi vận hành. Frontend kiểm tra phiên cũ/key retry/clear/view và report độc lập form. Kết quả thực tại docs/test-runs/2026-10-25-t22-t36.md; test không thay nghiệm thu/peer review. Codex hỗ trợ implementation, tests và tài liệu theo yêu cầu Minh Khuê; owner cần hiểu, demo và giải thích giả định.
