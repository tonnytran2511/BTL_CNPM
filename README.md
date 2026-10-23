# Smart E-Mobility Hub

Nền tảng bài tập lớn CNPM HK261, nhóm 5 người. Frontend React/TypeScript/Vite; backend NestJS/TypeScript; PostgreSQL với migration SQL và `pg`.

## Những phần đang chạy

- Đăng nhập/đăng xuất; session lưu database; quyền sinh viên/operator kiểm tra tại backend.
- Danh sách/chi tiết Hub, xe/mức pin, chỗ đỗ và cổng sạc từ database.
- Dashboard operator và polling theo cấu hình server.
- Snapshot nhất quán chỉ đọc để TV5 xây simulation.
- Seed giả lập từ JSON; migration, kiểm thử PostgreSQL riêng và kiểu API dùng chung.

Đã tích hợp đăng ký xe cá nhân, tra cứu/đặt/hủy lịch đỗ, check-in/check-out, gửi/xem yêu cầu sạc và AllocationPort; thuê xe có tìm/đặt/hủy/nhận/trả và lịch sử. T12 có API nhật ký sự cố và tạo/start/cancel lệnh trước khi chạy; chưa có UI quản trị hoặc hoàn tất điều chuyển. Hợp đồng tại `docs/api.md`.

Vòng đời thuê xe, quản trị tài nguyên và sự cố/điều chuyển chưa hoàn chỉnh. T13 đã có engine mô phỏng tăng nhu cầu và operator UI; mô hình giới hạn ở lượt rời Hub, xem docs/simulation.md. Scheduler và chạy phiên sạc thuộc tuần 2.

## Setup

Cần Node.js >=22.13 và npm. Phiên bản kiểm chứng ghi tại `docs/testing.md`.

Repository: https://github.com/tonnytran2511/BTL_CNPM

```sh
git clone https://github.com/tonnytran2511/BTL_CNPM.git
cd BTL_CNPM
```

```sh
npm ci
npm run setup:env
```

Lệnh setup tạo `.env` bằng mật khẩu ngẫu nhiên, không ghi đè file đã có. Chỉnh cấu hình tại đó; không commit/chia sẻ file `.env`. Xem `SEED_OPERATOR_EMAIL/PASSWORD` và `SEED_STUDENT_EMAIL/PASSWORD` để đăng nhập demo. Các biến `*_NAME` quyết định tên demo.

Chọn **một** cách chạy PostgreSQL:

```sh
# Docker Desktop phải đang chạy:
docker compose up -d
```

Hoặc PostgreSQL local qua package dev (không cần Docker):

```sh
npm run db:local
```

Giữ terminal database mở. Cả hai dùng `POSTGRES_*` trong `.env`; không chạy đồng thời trên cùng port. Local cluster lưu ở `.local/postgres`; Ctrl+C dừng database. Với database có sẵn, chỉnh `DATABASE_URL` rồi bỏ qua bước khởi động DB.

Trong terminal khác:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Mở URL `WEB_ORIGIN` trong `.env` (mặc định `http://localhost:5173`). Vite proxy `/api` đến `API_PORT`; không có database credentials trong bundle frontend. Nếu đổi origin/port, khởi động lại dev server. `VITE_API_TIMEOUT_MS` là thời gian chờ tối đa mỗi request (ms, ví dụ trong `.env.example`); khi cập nhật từ bản cũ, bổ sung biến này vào `.env` trước khi build/dev. Giá trị được kiểm tra khi Vite khởi động và được đưa vào bundle; thay đổi cần restart/rebuild. Chỉ đưa cấu hình công khai vào biến `VITE_*`.

Seed là dữ liệu ví dụ do nhóm kiểm soát qua `SEED_DATA_FILE`; có thể thay JSON trước lần seed đầu. Chạy lại seed giữ nguyên user, Hub và trạng thái vận hành đã tồn tại; thay mật khẩu trong `.env` sau seed không tự đổi mật khẩu user cũ. Các thay đổi dữ liệu đang vận hành phải đi qua migration/service hoặc công cụ quản trị phù hợp.

## Kiểm tra

### Demo T14 bằng database riêng

```sh
npm run demo:t14
```

Sau `npm ci` và `npm run setup:env`, lệnh này build ứng dụng, tạo PostgreSQL tạm, migrate/seed từ `database/seed.example.json`, mở API/Vite trên cổng trống và in URL cùng hai tài khoản ngẫu nhiên riêng cho phiên demo. Không dùng `DATABASE_URL` vận hành, không đổi `.env` hoặc seed DB đang dùng. Giữ terminal mở; Ctrl+C dừng API/Vite/PostgreSQL và xóa dữ liệu tạm. Có thể chỉ định `DEMO_SEED_DATA_FILE` cho một seed fixture khác. Không chia sẻ thông tin đăng nhập tạm.

Kịch bản, kết quả và giới hạn: [demo tích hợp T14](demo/T14-integrated-demo.md). T35 đã tích hợp qua PR #13; xem [hoàn tất kỹ thuật T14 ngày 23/10](demo/T14-t35-completion.md). Nghiệm thu/demo của từng thành viên vẫn cần được xác nhận riêng.

```sh
npm run build
npm test
npm run format:check
```

`npm test` chạy API integration trên PostgreSQL tạm/HTTP thật và frontend tests với Vitest/jsdom. Có thể chạy riêng `npm run test:api` hoặc `npm run test:web`. Database test dùng port trống, migration/seed riêng rồi dừng/xóa **chỉ cluster test**; không ghi vào database vận hành.

## Cấu trúc

```text
apps/api/src/           Nest controllers, services, repositories, auth
apps/web/src/components/ UI
apps/web/src/hooks/     state và điều phối giao diện
apps/web/src/api/       HTTP client
apps/web/src/models/    model trình bày
apps/web/src/utils/     định dạng thuần
packages/contracts/    kiểu response dùng chung
database/migrations/   schema có phiên bản
database/seed.example.json dữ liệu giả lập đầu vào
scripts/               setup, database, migration, seed
tests/                 integration test trên PostgreSQL thật
```

Đọc `AGENTS.md`, `docs/guides/DESIGN.md`, `docs/api.md` và `docs/guides/CONTRIBUTING.md` trước khi bổ sung module. Không dùng frontend để quyết định quyền hoặc phân bổ tài nguyên.

Nhóm trưởng dùng `docs/leader-review.md` để review/bàn giao; baseline nghiệp vụ và test chấp nhận tại `docs/business-rules.md`. Các request types dự kiến ở packages/contracts/planned.ts chưa phải endpoint chạy được.

Đặc tả 15 use case: `docs/use-cases.md`; UML source: `docs/diagrams/`; kế hoạch 36 testcase tích hợp và traceability: `docs/integration-test-plan.md`. Kết quả chạy thực tế được ghi riêng tại `docs/testing.md`.

Chạy production cần hosting, HTTPS/cookie Secure, cấu hình DB và chiến lược vận hành riêng; compose/local hiện phục vụ phát triển. Hướng dẫn này không khẳng định hệ thống đã được triển khai production.

## Simulation T13

Có mô phỏng tăng nhu cầu cho operator: chạy db:seed để thêm settings, nhập tham số và xem baseline/scenario trên cùng snapshot/seed. Engine đầu tiên chỉ mô phỏng lượt xe rời Hub; các kịch bản đỗ/sạc, đề xuất và lịch sử thuộc T22. Xem [docs/simulation.md](docs/simulation.md).
