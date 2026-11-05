# T27 — kiểm thử chéo Simulation với đỗ/sạc

- Execution: T27-20261105, ngày 05/11/2026 (Asia/Saigon).
- Thư mục thực hiện: `C:\Users\Mai Anh\Downloads\BTL_T27_Work\BTL_CNPM`.
- Nhánh: `t27/simulation-cross-testing`; base `3478f56ed49ca08310ec652be41b3414cc309464`.
- Người thực hiện: Codex theo yêu cầu Mai Anh; chưa có peer review/nghiệm thu sinh viên.
- Windows, PowerShell, Node v24.20.0, npm 11.19.0; PostgreSQL embedded từ lockfile.
- Nguồn yêu cầu: `docs/integration-test-plan.md` IT-32–36 và hợp đồng `docs/scenarios.md`. Cách gán IT trong trao đổi trước khác bảng chính thức; báo cáo này dùng ID trong repository.

## Phạm vi và cách chạy

Không thay engine T22, migration, hợp đồng API hoặc quy tắc T19/T20/T21 khi chưa tìm thấy lỗi. Thêm hai test oracle thuần và bốn subtest HTTP/PostgreSQL vào harness foundation hiện có. Test tích hợp được nối sau release workflow để không thay số liệu fixture mà các assertion seed trước đó cần dùng.

Toàn bộ fixture và API vận hành trong test chạy trên database tạm, cổng ngẫu nhiên, tài khoản ngẫu nhiên do harness tạo; không kết nối database vận hành trong `.env`. `npm run setup:env` tạo cấu hình local khi chưa có; không seed/migrate database vận hành. Chỉ database tạm được migrate/seed trong quá trình test. Không đóng gói `.env`, credentials, node_modules, dist hoặc dữ liệu PostgreSQL.

```powershell
npm ci
npm run setup:env
npm run build
npm test
# Chạy riêng phần engine và tích hợp liên quan:
node --test tests/simulation.test.mjs tests/scenarios.test.mjs tests/t27-simulation-cross.test.mjs tests/foundation.test.mjs
```

Không chạy `t27-simulation-cross-check.mjs` trực tiếp: helper chỉ nhận kết nối tới cluster tạm từ foundation.

## Ma trận và kết quả

| ID    | Dữ liệu và phép kiểm                                                                                                                                                                                                                                        | Bằng chứng                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| IT-32 | HTTP step=0/7, chiếm thêm vượt 4 chỗ có thể cấp, chọn cổng failed hoặc có incident: 400; không thêm history, không đổi 19 bảng                                                                                                                              | Subtest `T27 IT-32`, foundation                       |
| IT-33 | Chạy cả ba scenario qua HTTP; đọc snapshot lưu thật; tính lại trên đúng snapshot; deep-equal kết quả và deep-equal toàn bộ bảng trước/sau mỗi run                                                                                                           | Subtest `T27 IT-33/35`, foundation; SHA-256 trong log |
| IT-33 | Input đóng băng sâu, chạy lại cùng seed; sửa report trả về không sửa input/params; history cũ giữ nguyên sau booking thật, run mới đọc trạng thái mới                                                                                                       | Hai file T27                                          |
| IT-34 | Oracle sạc 20 phút/bước 5/service 10: một phiên active, hai người chờ 20/10 phút, một cổng failed. Baseline served/completed=3, queued=0, wait=20, utilization=50%; scenario served/completed=2, queued=1, wait=30, waiting-at-end=30, utilization=100/3%   | `t27-simulation-cross.test.mjs`                       |
| IT-34 | Demand conservation, tổng completed từ timeline, tổng served cộng active đầu kỳ; impact=scenario−baseline. Oracle nhu cầu thuê T13 và các invariant T36 chạy hồi quy kèm theo                                                                               | T27 engine và suites simulation/scenarios             |
| IT-35 | Hub 6 chỗ: một booking tương lai, một hold còn hạn, một hold hết hạn. Projection có đúng 4 chỗ (gồm hold hết hạn); chiếm thêm 4 thì served=0 và peak=5, không giả booking tương lai thành occupied                                                          | Foundation T27                                        |
| IT-35 | Ba cổng: failed, available có incident open, available. Baseline chỉ có 1 cổng; giả hỏng cổng cuối thì served/utilization=0, mọi demand vào queue                                                                                                           | Foundation T27                                        |
| IT-35 | Đề xuất parking/charging chỉ dùng Hub active, chỗ/cổng có thể cấp, không occupied/failed; lượng tối đa 1 trong oracle; reason/timestamp/revalidation đầy đủ; hết phương án trả review_capacity                                                              | T27 engine                                            |
| IT-36 | Lấy đề xuất redistribution thật từ HTTP/saved result, tạo lệnh qua API; sau reservation nguồn, start trả 409 và mọi bảng giữ nguyên; hủy reservation/start, giảm capacity đích về 0, complete trả 409, lệnh vẫn in_progress và history simulation không đổi | Subtest `T27 IT-36`, foundation                       |

Với IT-36, không có endpoint “apply simulation”. Test dùng API điều chuyển T21 theo source/target của recommendation và ID xe trong fixture, đúng workflow đang triển khai. Không tự replay snapshot hoặc tạo feature apply mới.

So sánh bất biến đọc mọi public base table, trừ `sessions`, `login_attempts` (auth bookkeeping) và `simulation_runs` (kết quả được phép lưu). Có 19 bảng được so, gồm private vehicles, bookings, requests/sessions sạc, xe, chỗ, incidents, redistributions, operation_logs, settings và idempotency. Hash thay đổi giữa các execution vì UUID/timestamp fixture ngẫu nhiên; chỉ yêu cầu before=after trong cùng execution. Việc tính lại bằng engine từ snapshot là kiểm tra wiring/persistence, không thay thế oracle số độc lập ở test thuần.

## Defect và retest

| ID      | Actual / nguyên nhân                                                                                              | Sửa và xác minh                                                                                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T27-D01 | Test dừng demo Windows trả exit code null thay vì 0: `child.kill('SIGTERM')` kết thúc ngay, JS cleanup không chạy | Parent mở IPC riêng và gửi shutdown trên Windows; demo chạy cùng cleanup như signal. Giữ SIGTERM trên hệ khác. Retest kiểm tra exit=0, HMR socket đóng, state file bị xóa |
| T27-D02 | Khi tất cả test file khởi động nhiều cluster đồng thời, cleanup demo vượt deadline 10 giây; standalone pass       | Runner giới hạn 2 test file đồng thời; vẫn giữ các request race bên trong suite. Log lỗi trước và kết quả retest được giữ riêng                                           |
| ENV-01  | Checkout mới chưa có `.env`: ba test import service và build Vite thiếu cấu hình                                  | Chạy setup local của dự án; không sửa business logic. Log ban đầu giữ để đối chiếu                                                                                        |
| ENV-02  | Lần hồi quy đầu có EBUSY lúc dọn cluster foundation dù mọi subtest pass                                           | Ghi nhận lỗi môi trường Windows; retest sau đó, không đánh dấu pass cho lần fail                                                                                          |

Không phát hiện lỗi engine/metrics/projection vận hành trong các case đã chạy; không tạo thay đổi nghiệp vụ chỉ để có bản sửa.

## Kết quả chạy cuối

`npm run build`: pass. `npm test`: exit 0, backend **140/140**, frontend **62/62**. Sáu case T27 mới đều pass (hai engine, bốn HTTP/PostgreSQL); không skip. Demo shutdown Windows và suite reservation từng gặp EBUSY đều pass ở lần cuối. Log đầy đủ: `t27-evidence/05-final-regression.txt`; cấu hình/kết quả/hash: `t27-evidence/validation.json`.

## Kiểm tra định dạng

Prettier cho 9 file thay đổi: pass. `git diff --check`: pass. Lệnh `npm run format:check` toàn repo báo 233 file có định dạng sẵn không khớp (log `format.txt`); không tự định dạng lại toàn repository để tránh thay đổi ngoài phạm vi T27.

## Bàn giao và giới hạn

Evidence tại `t27-evidence/`: log lỗi ban đầu, log retest đầy đủ, build, engine, kiểm tra định dạng và manifest. Kết quả cuối ghi trong `validation.json`; không dùng log thử lỗi ban đầu thay cho retest.

Patch/ZIP chứa đúng thay đổi trên base ghi trên; có thể review/apply bằng Git. Không commit, merge, push hay mở PR online. Bản mô tả PR chuẩn bị ở `t27-pr-description.md`.

Kiểm thử này xác nhận mô hình resource-flow-v1 theo các giả định đã công bố; không xác nhận dự báo nhu cầu ngoài thực tế, tốc độ sạc theo pin/kW, giao diện trình duyệt, video demo hay mọi interleaving có thể xảy ra. Không lấy test tự động thay peer review/nghiệm thu và khả năng giải thích của thành viên.
