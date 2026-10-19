# T14 — Báo cáo demo tích hợp D7, TV5 / T13

Ngày demo: 19/10/2026. Người phụ trách: Minh Khuê.

Recording demo: [Thư mục video D7 trên Google Drive](https://drive.google.com/drive/folders/18jdOcN2soXvNUl_WT7QpeXCqVR4d9oKE?usp=sharing).

## Thay đổi

- Cập nhật nhánh khue từ main tới `f550081`.
- Thêm nút Xóa kết quả: ẩn kết quả/timeline/nút xuất báo cáo và xóa lỗi, giữ nguyên tham số và cấu hình; khóa khi đang chạy.
- Thêm bảng Trạng thái Hub trong mô phỏng: số xe đủ điều kiện ở snapshot đầu kỳ, số còn lại cuối kỳ baseline/scenario, Hub, thời điểm snapshot UTC và model. Giá trị lấy từ kết quả hoàn thành, không từ form đang sửa.
- Nêu rõ simulation tính xong rồi dừng; kết quả mô phỏng tách khỏi vận hành thật. Không thêm API, migration hoặc thay đổi engine.
- Cập nhật docs/simulation.md, lưu báo cáo trong demo/ và liên kết recording trên Google Drive. Các hướng dẫn agent và checklist cá nhân giữ local qua Git ignore.

## Kết quả và bằng chứng

- **00:24 — Hub trước mô phỏng:** Hub ga Metro có METRO-B01 sẵn sàng (82% pin), METRO-B02 đang sạc (18%), METRO-M01 đã giữ chỗ (65%). C01 đang dùng, C02 sẵn sàng; 3 chỗ đang đỗ, 0 đang giữ.
- **00:48 — Kết quả và trạng thái Hub mô phỏng:** 1 xe đủ điều kiện đầu kỳ, 0 còn lại ở cả hai nhánh. Có snapshot UTC, model và nhãn phân biệt với vận hành thật.
- **01:12 — Timeline:** hiển thị diễn biến đến phút 60.
- **01:27, 01:48 — Xuất báo cáo:** tải và mở nội dung .txt trong Safari.
- **01:53 — Xóa kết quả.**
- **02:03 — Hub sau mô phỏng:** trạng thái xe/pin, cổng sạc và chỗ đỗ hiển thị khớp trước mô phỏng.

Tham số: Hub ga Metro, 60 phút, bước 5 phút, seed 42, baseline 0.2 và scenario 2 yêu cầu/bước, pin tối thiểu 20%. Snapshot báo cáo mở trong clip: `2026-10-19T15:06:06.604Z`.

| Chỉ số                  | Baseline | Tăng nhu cầu |
| ----------------------- | -------- | ------------ |
| Tổng yêu cầu            | 6        | 27           |
| Phục vụ                 | 1        | 1            |
| Không phục vụ           | 5        | 26           |
| Xe đủ điều kiện còn lại | 0        | 0            |

## Kiểm tra đã chạy

- `npm run build`: frontend/backend pass sau thay đổi UI.
- `npm run test:web`: 18/18 tests pass sau thay đổi UI; suite hiện có, không tuyên bố có test tự động riêng cho nút mới.
- `node --test tests/simulation.test.mjs`: 2/2 test engine pass trong đợt chuẩn bị trước thay đổi UI; kiểm tra tái lập, snapshot đầu vào bất biến, bảo toàn xe/nhu cầu và tham số biên.
- Prettier các file thay đổi và `git diff --check`: pass.
- Full integration suite chưa chạy lại trong đợt này. Tương tác Safari tự động không được cấp quyền; bằng chứng UI đến từ recording và xác nhận người demo.

## Note

Các đề xuất dưới đây đều **chờ review**.

- **UI-01 — Chi tiết Hub:** khối hiện nằm cuối trang, cần cuộn để xem. Đề xuất mở popup/modal khi chọn Hub.
- **UI-02 — Điều hướng:** nhiều chức năng nằm trên cùng một trang. Đề xuất tách charging, xe cá nhân/thuê xe và lịch sử xe thành các trang riêng.
- **UI-03 — Xóa lịch sử:** hiện không thể xóa lịch sử theo phản hồi của người demo. Đề xuất thêm nút xóa; cần chốt loại lịch sử, quyền và quy tắc lưu trữ. Đây là thao tác riêng với Xóa kết quả mô phỏng.

Chưa xác nhận lỗi chức năng chặn luồng qua các khung hình đã xem; không coi đó là full test pass. Nhờ thành viên khác review recording/báo cáo và ghi defect với bước tái hiện, mong đợi/thực tế, mức độ, người xử lý và kết quả kiểm tra lại.

## Giới hạn

T13 chỉ mô phỏng lượt xe rời Hub, chưa có trả xe/sạc/hàng chờ; không phải dự báo đã xác thực. Ba kịch bản, recommendations và lịch sử simulation thuộc T22. Reload chưa giữ kết quả. Demo này chỉ bao phủ TV5/T13, không xác nhận các module khác hoặc toàn bộ mốc D7 hoàn thành.
