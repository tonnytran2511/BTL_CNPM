# Baseline nghiệp vụ v1 cho nhóm review

Nhóm trưởng chuẩn bị baseline này để các module có cùng cách xử lý. Đây là lựa chọn thiết kế cho dự án, không phải yêu cầu nguyên văn của đề hoặc xác nhận cả nhóm đã duyệt. Chỉ auth, đọc Hub/dashboard, dữ liệu cốt lõi và snapshot đã có code. Các BR về thuê/đỗ/sạc/điều chuyển/simulation là tiêu chí cho phần triển khai tiếp theo.

## Quy tắc và nghiệm thu

| Mã    | Lựa chọn baseline                                                                                                                                                                                                | Owner               | Test bắt buộc                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| BR-01 | Đặt xe chỉ giữ xe ở Hub nguồn; chưa giữ chỗ trả tại Hub đích. Thời hạn giữ lấy từ cấu hình DB.                                                                                                                   | TV2                 | Hai người đặt cùng xe: đúng một người thành công; hết hạn không nhận xe được.                           |
| BR-02 | Nhận xe đổi reservation sang fulfilled, tạo trip, đổi xe sang in_use và giải phóng chỗ nguồn trong **cùng transaction**.                                                                                         | TV2 + TV3           | Bất kỳ bước nào lỗi: tất cả thay đổi rollback; không tạo trip thứ hai khi gửi lặp.                      |
| BR-03 | Trả xe kiểm tra và chiếm chỗ ở Hub đích đang active trong cùng transaction với kết thúc trip/cập nhật xe. Nếu đích đầy, trip giữ active; trả lỗi xung đột và gợi ý Hub khác còn chỗ.                             | TV2 + TV3           | Đích đầy không kết thúc trip; hai xe tranh chỗ cuối chỉ một xe trả thành công.                          |
| BR-04 | Lịch đặt đỗ dùng khoảng `[startsAt, endsAt)` theo UTC. Kết thúc đúng lúc lịch tiếp theo bắt đầu không tính trùng. `startsAt < endsAt`; giới hạn thời lượng lấy từ cấu hình.                                      | TV3                 | Trùng một phần/toàn phần bị từ chối; hai lịch tiếp giáp được chấp nhận.                                 |
| BR-05 | Bảng lịch đặt đỗ tương lai tách khỏi trạng thái vật lý hiện tại của parking_spaces. Chỉ cập nhật held/occupied khi tài nguyên thực sự được giữ/chiếm.                                                            | TV3                 | Đặt lịch ngày mai không làm dashboard hôm nay mất chỗ; check-in/check-out nhất quán.                    |
| BR-06 | Yêu cầu sạc kiểm tra quyền sở hữu xe cá nhân/quyền vận hành xe thuê; targetBatteryPercent lớn hơn pin hiện tại và không vượt 100. Không cấp phiên mới cho cổng failed.                                           | TV3                 | Sai quyền/target pin bị từ chối; hỏng cổng không nhận việc.                                             |
| BR-07 | Ưu tiên sạc: yêu cầu vượt thời gian chờ tối đa lên nhóm đầu (FIFO trong nhóm này); kế tiếp là cần xe sớm, pin thấp, rồi thời hạn cần xe/pin/thời điểm yêu cầu/ID để phân xử ổn định. Các ngưỡng lấy từ cấu hình. | TV3                 | Cùng dữ liệu cho cùng thứ tự; yêu cầu chờ lâu không bị bỏ qua mãi; thay ngưỡng làm thứ tự đổi đúng.     |
| BR-08 | Cổng sạc hỏng: phiên đang chạy chuyển interrupted, ghi pin đã đạt theo dữ liệu vận hành; phần nhu cầu còn lại trở lại hàng chờ nếu vẫn cần sạc. Không báo completed khi chưa đạt mục tiêu.                       | TV3 + TV4           | Không mất yêu cầu; cổng vẫn failed; không tạo hai phiên chạy cho cùng yêu cầu.                          |
| BR-09 | Điều chuyển chỉ chọn xe available tại Hub nguồn active, không giữ/thuê/sạc/bảo trì. Bắt đầu chiếm quyền sử dụng xe; hoàn thành dùng allocation service ở đích và cập nhật vị trí trong transaction.              | TV4 + TV2 + TV3     | Đặt xe và điều chuyển đồng thời chỉ một luồng thắng; đích đầy không báo hoàn thành.                     |
| BR-10 | Xe hỏng không nhận thuê/điều chuyển/sạc mới. Nếu đang thuê hoặc có đặt chỗ, ghi sự cố và xử lý workflow bị ảnh hưởng; không tự xóa trip/history.                                                                 | TV4 + TV2           | Xe hỏng bị chặn; vẫn truy vết được trip/reservation liên quan.                                          |
| BR-11 | Lệnh mutation quan trọng nhận Idempotency-Key; phạm vi theo actor + operation. Cùng key/cùng payload trả kết quả cũ; cùng key/khác payload bị từ chối 409.                                                       | Chủ module + leader | Gửi lặp không nhân đôi trip/session/lệnh; key không dùng lại giữa người khác.                           |
| BR-12 | API thời gian có timezone, lưu timestamptz; tất cả slot so sánh ở UTC. ID/role/ngưỡng không lấy từ UI để quyết định quyền hoặc tài nguyên.                                                                       | Cả nhóm             | Sai quyền vẫn bị chặn khi gọi API trực tiếp; thời gian khác timezone cùng instant được hiểu giống nhau. |
| BR-13 | Simulation sao chép snapshot, tham số và seed. Bước thời gian dương, không lớn hơn horizon; horizon chia hết cho step; giới hạn số bước lấy từ cấu hình.                                                         | TV5                 | Sai đầu vào bị từ chối; cùng snapshot/inputs/seed cho cùng kết quả; DB vận hành không đổi.              |
| BR-14 | So sánh baseline và scenario từ **cùng snapshot và seed**. Chỉ số tính từ trạng thái/event đã mô phỏng: served/unserved demand, thời gian chờ, peak parking và charging utilization.                             | TV5                 | Không có số liệu cố định theo tên kịch bản; đổi đầu vào tạo tác động có lý do.                          |
| BR-15 | Đề xuất đi kèm lý do, nguồn/đích, tài nguyên và snapshot time. Thực thi đề xuất gọi service vận hành và kiểm tra lại trạng thái hiện tại; không replay snapshot vào DB.                                          | TV5 + TV4           | Snapshot cũ không cho phép ghi đè trạng thái; xe/chỗ không còn phù hợp bị từ chối.                      |

## Cấu hình cần module sở hữu bổ sung

| Key dự kiến trong settings     | Đơn vị / validation                            | Owner |
| ------------------------------ | ---------------------------------------------- | ----- |
| reservationHoldMinutes         | Số nguyên dương                                | TV2   |
| minimumRentalBatteryPercent    | 0–100                                          | TV2   |
| maximumParkingDurationMinutes  | Số nguyên dương                                | TV3   |
| chargingUrgencyWindowMinutes   | Số nguyên không âm                             | TV3   |
| chargingMaximumWaitMinutes     | Số nguyên dương                                | TV3   |
| simulationMaximumSteps         | Số nguyên dương                                | TV5   |
| simulationTravelMinutesByRoute | Route IDs và thời lượng dương                  | TV5   |
| simulationChargingModel        | Tham số năng lượng/công suất có đơn vị rõ ràng | TV5   |

Các key trên **chưa có trong DB**, trừ lowBatteryThreshold đã dùng ở dashboard. Chủ module thêm migration/seed và validation khi triển khai; không tự fallback sang số trong service. Giá trị demo là dữ liệu cấu hình nhóm chọn, không phải con số từ giảng viên.

## Trạng thái dự kiến

- Vehicle reservation: active → cancelled / expired / fulfilled. Trạng thái kết thúc không quay lại active.
- Trip: active → completed; sự cố không tự completed.
- Charging request: queued → allocated → fulfilled; gián đoạn có thể đưa về queued; hủy phải giải phóng tài nguyên.
- Charging session: scheduled → charging → completed / interrupted / cancelled; chỉ một session charging cho một request/point.
- Redistribution: pending → in_progress → completed / cancelled; hủy đang in_progress phải có xử lý vị trí thực tế, không chỉ đổi status.

Đây là lifecycle baseline, không thay thế sơ đồ hành vi và đặc tả chi tiết của chủ module. Mọi thay đổi BR ảnh hưởng nhiều module phải được ghi trong PR và DESIGN trước khi merge.
