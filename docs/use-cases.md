# Đặc tả use case v1 — 15/10/2026

Cập nhật tích hợp T14 ngày 20/10/2026, base main `435f7a0` sau PR #11. Danh mục dưới đây phản ánh code hiện có. Các bước ghi “mục tiêu” thuộc thiết kế mở rộng, chưa phải kết quả triển khai; không thay thế peer review của thành viên. Cập nhật 23/10: T35 đã merge PR #13, có API/UI và regression tích hợp; các kết quả 20/10 được giữ ở báo cáo lịch sử.

## Ranh giới và actor

System boundary bao gồm web, API, database và bộ mô phỏng nội bộ. Sinh viên dùng xe thuê hoặc xe cá nhân; người vận hành giám sát, xử lý tài nguyên và chạy simulation. Database, scheduler, đồng hồ và module simulation là thành phần nội bộ, không phải actor độc lập. IoT thật chưa thuộc phạm vi triển khai hiện tại.

| Actor / stakeholder          | Mục tiêu                                                        | Tương tác                                   |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Sinh viên                    | Tìm phương tiện, đỗ và sạc phù hợp                              | UC-01–09                                    |
| Người vận hành               | Theo dõi khả năng phục vụ, xử lý sự cố, phân bổ và thử kịch bản | UC-01/02 và UC-09–15                        |
| Đơn vị quản lý khu đô thị    | Tài nguyên được dùng đúng, dịch vụ có thể kiểm tra              | Stakeholder; chưa có actor/role riêng       |
| Nhóm phát triển / giảng viên | Đánh giá tính nhất quán yêu cầu–thiết kế–code–test              | Stakeholder; không gán quyền trong sản phẩm |

Nguồn UML use-case diagram: [sinh viên](diagrams/use-cases-student.puml), [vận hành](diagrams/use-cases-operator.puml). Đây là source PlantUML; cần render thành hình khi đưa vào báo cáo. Đăng nhập là điều kiện cho nghiệp vụ được bảo vệ, không thêm quan hệ include đăng nhập vào mọi lần thao tác.

## Danh mục và trạng thái

| UC    | Tên                          | Yêu cầu      | Owner                | Trạng thái                          |
| ----- | ---------------------------- | ------------ | -------------------- | ----------------------------------- |
| UC-01 | Đăng nhập / đăng xuất        | FR-13        | Leader               | Có code                             |
| UC-02 | Xem danh sách / chi tiết Hub | FR-01        | Leader               | Có code                             |
| UC-03 | Tìm xe thuê phù hợp          | FR-02        | TV2                  | Có code tìm xe T06                  |
| UC-04 | Đặt / hủy đặt xe             | FR-03        | TV2                  | Có đặt/hủy T07; expiry chờ T16      |
| UC-05 | Nhận xe                      | FR-04        | TV2 + TV3            | Có code T08, kiểm tra hạn giữ       |
| UC-06 | Trả xe                       | FR-04        | TV2 + TV3            | Có code T08, allocation nguyên tử   |
| UC-07 | Đăng ký xe cá nhân           | FR-05        | TV3                  | Có code đăng ký T09–T10             |
| UC-08 | Đặt / sử dụng chỗ đỗ         | FR-05        | TV3                  | Có đặt/hủy/check-in/out T10–T11     |
| UC-09 | Yêu cầu sạc                  | FR-06        | TV3                  | Có hàng chờ T11; chưa chạy phiên    |
| UC-10 | Phân bổ / quản lý phiên sạc  | FR-06, FR-07 | TV3                  | Chờ T19–T20                         |
| UC-11 | Giám sát mạng lưới           | FR-01        | Leader               | Có code dashboard cơ bản            |
| UC-12 | Quản lý Hub / tài nguyên     | FR-08        | TV4                  | Đã có API/UI T35, xem phạm vi UC-12 |
| UC-13 | Xử lý sự cố                  | FR-09        | TV4 + chủ tài nguyên | T12: ghi/đóng; tác động chờ T21     |
| UC-14 | Điều chuyển xe               | FR-10        | TV4 + TV2 + TV3      | T12: tạo/start/cancel pending       |
| UC-15 | Chạy What-if và xem đề xuất  | FR-11, FR-12 | TV5                  | T13 departures-v1; mở rộng chờ T22  |

## UC-01 — Đăng nhập / đăng xuất

- Actor: sinh viên hoặc người vận hành. Trigger: gửi form đăng nhập hoặc chọn đăng xuất.
- Tiền điều kiện: tài khoản active được cấp; database truy cập được. Không có đăng ký/quên mật khẩu trong bản hiện tại.
- Input: email, mật khẩu; logout sử dụng cookie session.
- Luồng chính: (1) gửi thông tin; (2) validate và kiểm tra mật khẩu; (3) tạo session có hạn, cookie HttpOnly; (4) trả user không chứa secret; (5) UI hiển thị theo role. Logout thu hồi session và xóa cookie.
- Ngoại lệ: DTO sai → 400; thông tin sai/user inactive → 401 với thông báo chung; vượt rate limit → 429; Origin không hợp lệ → 403; DB lỗi → lỗi server có thể thử lại.
- Hậu điều kiện: đăng nhập thành công có session; logout token cũ không còn hợp lệ; lỗi không cấp quyền. Session expired bị từ chối ở request sau.
- T15 (20/10): khi refresh phát hiện `/auth/me` có ID/role khác UI, hoặc dashboard trả 403, frontend xóa dữ liệu và yêu cầu đăng nhập lại. Đây không phải thao tác revoke session server; lỗi mạng/5xx không tự đăng xuất.
- Liên kết: BR-12, IT-01/02/03. Chưa có bằng chứng peer review.

## UC-02 — Xem danh sách / chi tiết Hub

- Actor: sinh viên hoặc người vận hành. Trigger: mở trang Hub hoặc chọn chi tiết.
- Tiền điều kiện: session hợp lệ; sinh viên chỉ truy cập Hub active.
- Input: Hub ID khi xem chi tiết.
- Luồng chính: (1) kiểm tra session/role; (2) đọc trạng thái từ DB; (3) tính xe, chỗ đỗ, cổng sạc; (4) hiển thị danh sách; (5) chọn Hub để xem xe, pin, trạng thái và cổng sạc.
- Ngoại lệ: ID sai → 400; không tồn tại hoặc inactive đối với sinh viên → 404; không có Hub/tài nguyên → danh sách rỗng và UI empty; lỗi cập nhật giữ dữ liệu cũ kèm thông báo.
- Hậu điều kiện: không thay đổi tài nguyên; số liệu theo thời điểm đọc, không cam kết xe/chỗ còn khả dụng khi đặt sau đó.
- Liên kết: IT-04/05; NFR-04. Có code và kiểm tra nền tảng.

## UC-03 — Tìm xe thuê phù hợp

- Actor: sinh viên. Trigger: chọn Hub và điều kiện tìm xe.
- Tiền điều kiện: session hợp lệ, Hub active; ngưỡng pin thuê đã được cấu hình.
- Input: Hub ID, loại xe và điều kiện pin/hành trình được module thống nhất.
- Luồng chính: (1) validate bộ lọc; (2) đọc xe ở Hub; (3) chỉ trả xe có trạng thái cho phép và đạt điều kiện pin; (4) hiển thị pin, loại và tình trạng; (5) người dùng chọn xe để sang UC-04.
- Ngoại lệ: bộ lọc sai → 400; không phù hợp → empty; xe thay trạng thái sau tìm kiếm → kiểm tra lại khi đặt, không lấy kết quả tìm làm quyền giữ xe.
- Hậu điều kiện: không giữ xe. Định nghĩa tính pin theo khoảng cách cần TV2 review; chưa có route-distance model.
- Liên kết: IT-06, cấu hình minimumRentalBatteryPercent.

## UC-04 — Đặt / hủy đặt xe

- Actor: sinh viên. Trigger: đặt xe đang hiển thị hoặc hủy đặt chỗ của mình.
- Tiền điều kiện: xe available ở Hub active, đủ pin; không có đặt chỗ còn hiệu lực khác cho cùng xe.
- Input: vehicleId; hủy dùng reservationId; mutation chưa có Idempotency-Key tổng quát; BR-11/T17 là phần tiếp theo.
- Luồng chính: (1) kiểm tra quyền/điều kiện; (2) giữ xe nguyên tử; (3) tạo reservation active với expiresAt từ cấu hình; (4) trả thời hạn nhận xe. Hủy hợp lệ đổi reservation cancelled và giải phóng xe.
- Ngoại lệ: cạnh tranh giữ xe hoặc sai trạng thái → 409; sai quyền → 403; hết hạn thì không thể nhận xe. Nhận xe kiểm tra expiresAt sau khi chờ khóa; scheduler giải phóng hết hạn chưa triển khai (T16).
- Hậu điều kiện: tối đa một quyền giữ cùng xe; không giữ chỗ ở Hub đích; request thất bại không để reservation nửa chừng.
- Liên kết: BR-01/11; IT-07/08/09/10.

## UC-05 — Nhận xe

- Actor: sinh viên. Trigger: xác nhận nhận xe đã đặt.
- Tiền điều kiện: reservation thuộc người dùng, active, chưa hết hạn; xe reserved phù hợp và còn ở Hub nguồn.
- Input: reservationId. Gửi lặp reservation fulfilled trả trip cũ; chưa có Idempotency-Key tổng quát (T17).
- Luồng chính: trong một transaction, (1) khóa/kiểm tra reservation và xe; (2) xác nhận chỗ nguồn; (3) tạo trip active; (4) reservation fulfilled, xe in_use; (5) giải phóng chỗ nguồn; (6) commit và hiển thị chuyến đi.
- Ngoại lệ: hết hạn/xe lỗi/sai trạng thái → từ chối; sai quyền → 403; lỗi một bước → rollback toàn bộ; gửi lặp không tạo trip mới.
- Hậu điều kiện: đúng một trip cho lần nhận xe; dashboard nguồn phản ánh chỗ được giải phóng.
- Liên kết: BR-02/11; IT-10/11/12; AllocationPort của TV3.

## UC-06 — Trả xe

- Actor: sinh viên. Trigger: chọn Hub đích và xác nhận trả.
- Tiền điều kiện: trip active thuộc người dùng; Hub đích active.
- Input: tripId, targetHubId. Lặp return với cùng đích sau completed trả kết quả cũ; khác đích 409. Idempotency-Key tổng quát còn chờ T17.
- Luồng chính: trong một transaction, (1) khóa/kiểm tra trip và xe; (2) chiếm chỗ đích qua allocation service; (3) cập nhật xe/hub và trip completed; (4) commit; (5) hiển thị kết quả và cập nhật dashboard. Bản T08 đưa xe về available và giữ mức pin hiện có; tìm/đặt vẫn áp dụng ngưỡng pin cấu hình. Telemetry/hao pin và kiểm tra lại pin lúc nhận thuộc T17.
- Ngoại lệ: đích đầy → 409, trip vẫn active, gợi ý Hub còn chỗ; không có Hub thay thế → thông báo chưa thể trả và liên hệ vận hành; lỗi allocation → rollback; request lặp không chiếm thêm chỗ.
- Hậu điều kiện: xe chiếm đúng một chỗ ở đúng Hub; trip chỉ kết thúc khi trả thành công.
- Liên kết: BR-03/11; IT-13/14/15/16.

## UC-07 — Đăng ký xe cá nhân

- Actor: sinh viên. Trigger: thêm xe cá nhân.
- Tiền điều kiện: session hợp lệ.
- Input: code, type và batteryPercent theo DTO; owner lấy từ session. Pin là dữ liệu khai báo, không giả định từ telemetry.
- Luồng chính: (1) validate; (2) kiểm tra định danh trùng; (3) lưu xe với owner; (4) trả xe để dùng đặt đỗ/sạc.
- Ngoại lệ: dữ liệu sai → 400; định danh trùng → 409; client gán owner khác bị từ chối/không nhận field. Quy tắc xác minh định danh xe thật chưa có trong scope demo.
- Hậu điều kiện: xe cá nhân có một owner; chưa tự chiếm chỗ/sạc.
- Liên kết: IT-17; FR-05.

## UC-08 — Đặt / sử dụng chỗ đỗ

- Actor: sinh viên dùng xe cá nhân. Trigger: chọn Hub và khoảng đỗ.
- Tiền điều kiện: xe thuộc người dùng; Hub active; lịch trong giới hạn cấu hình.
- Input: hubId, privateVehicleId, startsAt, endsAt; thao tác hủy/check-in/out dùng bookingId.
- Luồng chính: (1) validate khoảng UTC; (2) phân bổ lịch không xung đột nguyên tử; (3) tạo booking; (4) khi đến, kiểm tra điều kiện check-in và chiếm tài nguyên vật lý; (5) khi ra, kết thúc và giải phóng. Hủy trước sử dụng giải phóng lịch, không xóa history.
- Ngoại lệ: trùng lịch/hết sức chứa → 409; sai quyền → 403; khoảng sai → 400; chỗ thực tế không còn phục vụ được → không báo check-in thành công, trả phương án vận hành.
- Hậu điều kiện: lịch tương lai không trực tiếp giảm chỗ trống hiện tại; lịch tiếp giáp không trùng; chỗ đang chiếm có xe xác định.
- Liên kết: BR-04/05/12; IT-18/19/20/21. Grace period, no-show và xử lý quá giờ cần TV3 review trước code.

## UC-09 — Yêu cầu sạc

- Actor: sinh viên cho xe cá nhân; operator cho xe thuê.
- Tiền điều kiện: quyền đối với xe hợp lệ; Hub active; xe cá nhân đã check-in tại Hub; xe thuê chỉ operator gửi yêu cầu và phải available tại Hub; target lớn hơn pin hiện tại.
- Input: hubId, vehicle kind/id, targetBatteryPercent, requiredBy tùy chọn.
- Luồng chính: (1) validate mục tiêu và quyền; (2) kiểm tra yêu cầu đang tồn tại theo quy tắc chống trùng; (3) lưu request queued; (4) trả trạng thái chờ/ước lượng nếu có mô hình; (5) UC-10 phân bổ khi có tài nguyên.
- Ngoại lệ: target ≤ pin hiện tại hoặc >100 → 400; sai quyền → 403; tất cả cổng hỏng/bận → không hứa phiên chạy ngay. Chính sách nhận queue khi không có cổng hoạt động phải được TV3 nêu rõ.
- Hậu điều kiện: request không tự trở thành phiên charging khi chưa có allocation.
- Liên kết: BR-06; IT-22/23.

## UC-10 — Phân bổ / quản lý phiên sạc

- Phạm vi tại T14: Chưa có scheduler/API phiên sạc T19–T20; luồng dưới đây là mục tiêu.

- Actor: operator; thuật toán/scheduler thực thi nội bộ theo cấu hình.
- Trigger: yêu cầu mới, có cổng trống, cập nhật pin/thời hạn hoặc lệnh vận hành.
- Tiền điều kiện: có request queued đủ điều kiện; policy hợp lệ.
- Luồng chính: (1) xếp thứ tự theo BR-07; (2) cấp cổng phù hợp trong transaction; (3) tạo session, đổi request allocated; (4) bắt đầu charging; (5) cập nhật pin từ dữ liệu vận hành; (6) đạt mục tiêu thì completed/fulfilled và giải phóng cổng.
- Ngoại lệ: không có cổng → tiếp tục queue; cổng lỗi trong phiên → UC-13/BR-08; request bị hủy hoặc xe không còn hợp lệ → không cấp mới; lỗi transaction → không để cổng occupied với session không tồn tại.
- Hậu điều kiện: mỗi point/request có tối đa một phiên đang chạy; thứ tự tái lập; chờ lâu được xét theo policy.
- Liên kết: BR-06/07/08/11; IT-24/25/26.

## UC-11 — Giám sát mạng lưới

- Actor: operator. Trigger: mở dashboard, refresh hoặc polling.
- Tiền điều kiện: session operator hợp lệ.
- Luồng chính: (1) đọc trạng thái Hub/resource; (2) tổng hợp số lượng/tỷ lệ; (3) hiển thị cảnh báo hiện có; (4) cập nhật theo chu kỳ cấu hình; (5) xem chi tiết Hub khi cần.
- Ngoại lệ: sinh viên gọi overview → 403; DB/kết nối lỗi → không hiển thị như dữ liệu vừa cập nhật; không có Hub → empty; Hub inactive không được tính tài nguyên available.
- Hậu điều kiện: không thay đổi tài nguyên. Cảnh báo dự báo quá tải chưa có, hiện chỉ có trạng thái cổng sạc lỗi và các chỉ số cơ bản.
- Liên kết: IT-04/05/27; NFR-03/04.

## UC-12 — Quản lý Hub / tài nguyên

- Phạm vi 23/10: T35 có CRUD Hub, cấu hình sức chứa, thêm/xóa cổng sạc và UI operator. Backend khóa Hub, cổng sạc trước khi kiểm tra/xóa; bảo vệ hold, booking, session và incident mở. Chưa có audit log chung cho mọi thay đổi Hub.

- Actor: operator. Trigger: thêm/sửa Hub, cấu hình tài nguyên, đổi active/inactive.
- Tiền điều kiện: quyền hợp lệ; dữ liệu đầu vào được validate.
- Luồng chính: (1) xem dữ liệu hiện tại; (2) gửi thay đổi; (3) kiểm tra invariant, tài nguyên/lịch bị ảnh hưởng; (4) cập nhật trong transaction; (5) dashboard đọc lại API. Ghi audit log chung là mục tiêu mở rộng, chưa triển khai trong T35.
- Ngoại lệ: giảm sức chứa dưới phần đang chiếm/giữ hoặc làm lịch đã cam kết bất khả thi → 409; không được xóa chỗ/cổng đang dùng; chuyển inactive hiện chỉ đổi trạng thái Hub, ẩn với student/chặn nhận tài nguyên mới, không tự hủy booking/trip. Chính sách xử lý các cam kết cũ vẫn cần owner review.
- Hậu điều kiện: không tạo sức chứa âm hoặc tài nguyên mồ côi; code/mã định danh không trùng.
- Liên kết: IT-28; FR-08. Chính sách inactive/giảm capacity phải TV4 phối hợp TV2/TV3 review.

## UC-13 — Xử lý sự cố

- Phạm vi tại T14: T12 có POST tạo incident và resolve qua API, lưu actor/time; chưa có UI quản trị và chưa tự đổi tài nguyên hay xử lý trip/charging. Luồng đầy đủ dưới đây là mục tiêu T21/T20.

- Actor: operator. Trigger: ghi nhận hoặc xử lý sự cố xe/cổng sạc.
- Tiền điều kiện: tài nguyên tồn tại; actor có quyền.
- Luồng chính: (1) ghi incident với thời gian/người báo; (2) chặn cấp mới tài nguyên hỏng; (3) xử lý reservation/trip/session liên quan theo service owner; (4) ghi tiến trình; (5) xác nhận sửa và kiểm tra điều kiện trước khi phục hồi.
- Ngoại lệ: cổng đang sạc → interrupted/requeue theo BR-08; xe đang thuê → giữ trip/history và có xử lý vận hành; đóng incident không mặc định xe đủ pin/cổng đã sẵn sàng nếu kiểm tra chưa đạt.
- Hậu điều kiện: sự cố truy vết được; không mất nhu cầu đang chờ; resource state khớp trạng thái thực.
- Liên kết: BR-08/10; IT-26/29.

## UC-14 — Điều chuyển xe

- Phạm vi tại T14: T12 có API tạo pending, start in_progress, hủy khi pending; chưa có endpoint hoàn tất/hủy đang chạy hoặc UI theo dõi. Luồng đầy đủ dưới đây là mục tiêu T21/T37.

- Actor: operator. Trigger: tạo lệnh trực tiếp hoặc từ đề xuất simulation.
- Tiền điều kiện: nguồn/đích active, khác nhau; xe available tại nguồn; quyền dùng xe chưa bị luồng khác chiếm.
- Input: sourceHubId, targetHubId, vehicleIds và Idempotency-Key.
- Luồng chính: (1) tạo/validate lệnh; (2) khi start kiểm tra lại và giữ xe; (3) ghi in_progress cùng thao tác tài nguyên nguồn; (4) khi xe đến, kiểm tra/chiếm chỗ đích; (5) cập nhật vị trí và completed trong transaction; (6) log/dashboard cập nhật.
- Ngoại lệ: xe đã reserved/in_use → 409; đích đầy khi hoàn thành → không completed; lệnh hủy đang di chuyển cần ghi vị trí thực và phương án đưa xe về/Hub thay thế, không tự phục hồi về nguồn bằng dữ liệu cũ.
- Hậu điều kiện: một xe không đồng thời cho thuê/điều chuyển; xe/chỗ ở đích nhất quán.
- Liên kết: BR-09/11/15; IT-30/31.

## UC-15 — Chạy What-if và xem đề xuất

- Phạm vi tại T14: T13 đã có operator UI và engine departures-v1 tăng nhu cầu, snapshot chỉ đọc, so sánh baseline/scenario và TXT/xóa kết quả. Chưa có lưu lịch sử, ba kịch bản và recommendations T22; luồng đầy đủ dưới đây là mục tiêu.

- Actor: operator. Trigger: chọn kịch bản và tham số.
- Input: ScenarioInput, horizonMinutes, stepMinutes, seed theo planned.ts.
- Tiền điều kiện: snapshot/policy đủ dữ liệu cho mô hình; operator có quyền; giả định và đơn vị đã được TV5 ghi rõ.
- Luồng chính: (1) validate inputs; (2) lấy snapshot nhất quán; (3) chạy baseline và scenario cùng snapshot/seed; (4) mô phỏng event/state theo bước; (5) tính chỉ số; (6) tạo đề xuất có lý do/ràng buộc; (7) lưu cấu hình/kết quả và hiển thị so sánh. Nếu operator muốn áp dụng, sang UC-14 hoặc workflow sạc phù hợp và kiểm tra lại dữ liệu hiện tại.
- Ngoại lệ: input sai hoặc quá số bước → 400; policy/model thiếu → lỗi rõ ràng, không điền kết quả giả; không có phương án khả thi → ghi không có đề xuất phù hợp; đề xuất cũ không còn hợp lệ → từ chối áp dụng, không ghi đè vận hành.
- Hậu điều kiện: resource/trip/booking thực không đổi sau chạy; chỉ simulation run/result được lưu; kết quả có snapshot time, inputs, seed, phiên bản mô hình để tái lập.
- Liên kết: BR-13/14/15; IT-32/33/34/35/36. Endpoint snapshot hiện tại chưa đủ dữ liệu booking/session/demand, phải mở rộng khi các module có code.

## Những điểm cần chốt cùng chủ module

TV2/TV3 chốt trạng thái xe sau trả và ngưỡng pin; TV3 chốt check-in/no-show/quá giờ và queue khi cổng không hoạt động; TV4 chốt inactive Hub và hủy điều chuyển đang chạy; TV5 chốt demand/travel/charging model và đơn vị chỉ số. Leader tổng hợp quyết định vào BR/DESIGN và cập nhật testcase trước merge.

### Cập nhật UC-05/06 theo T08 ngày 20/10

Nhận xe fulfilled và trả xe completed đã có controller/service/UI; chi tiết API và repeat semantics tại api.md. UC-04/05 chưa có scheduler tự hết hạn T16. UC-05 chưa kiểm tra lại ngưỡng pin khi đã giữ xe (T17). UC-06 hiển thị mọi chuyến active, chọn đích riêng; không thêm giới hạn một chuyến mỗi người khi backend chưa có rule. Test trip.test.mjs gồm quyền, trạng thái, rollback, cạnh tranh chỗ, cấu hình gợi ý và thứ tự khóa Hub/xe; đây không phải xác nhận tất cả testcase IT-10–16 hoặc T17 đã đạt.
