# Kiến trúc và dữ liệu nền tảng

Sơ đồ này phản ánh bản đang triển khai. Các module nghiệp vụ chưa có code được liệt kê riêng trong tài liệu API và bàn giao.

```mermaid
flowchart LR
  UI[React UI] --> Hooks[Hooks / presentation models]
  Hooks --> Client[API client]
  Client --> Controllers[Nest controllers / validation]
  Controllers --> Guard[Session / role guard]
  Guard --> Services[AuthService / HubsService / MobilityService]
  Services --> Repos[Repositories]
  Repos --> DB[(PostgreSQL)]
  Snapshot[Read-only snapshot API] --> Services
  Env[Environment configuration] --> Controllers
  Seed[Configurable seed JSON] --> DB
```

Auth guard chạy trước controller; public endpoints được đánh dấu rõ. HubsService lọc theo role và tổng hợp overview; repositories chứa SQL. Kiểu response dùng chung ở packages/contracts là contract thuần, không chứa code backend.

Chọn một backend theo module để ghép công việc của 5 người và demo local đơn giản. Đánh đổi: các module triển khai cùng một ứng dụng; migration/hợp đồng cần review chung. Chưa cần microservice hoặc message broker.

## Class diagram nền tảng

```mermaid
classDiagram
  class AuthController {
    login(body, request, response)
    me(request)
    logout(request, response)
  }
  class AuthGuard {
    canActivate(context)
  }
  class AuthService {
    login(email, password)
    current(token)
    logout(token)
  }
  class AuthRepository {
    credentials(email)
    createSession(tokenHash, userId, ttl)
    session(tokenHash)
    revoke(tokenHash)
  }
  class HubsController {
    list(request)
    detail(id, request)
    overview()
    snapshot()
  }
  class HubsService {
    list(role)
    detail(id, role)
    overview()
    snapshot()
  }
  class HubsRepository {
    summaries(client)
    detail(id, client)
    snapshot(work)
  }
  class Database {
    query(sql, values)
    readSnapshot(work)
    onModuleDestroy()
  }
  AuthController --> AuthService
  AuthGuard --> AuthService
  AuthService --> AuthRepository
  AuthRepository --> Database
  HubsController --> HubsService
  HubsService --> HubsRepository
  HubsRepository --> Database
```

Các dependency được inject bằng Nest. Class diagram này chỉ mô tả module đang có code; chưa bao gồm các class thuộc nhiệm vụ TV2–TV5.

## ERD đã triển khai

```mermaid
erDiagram
  users ||--o{ sessions : has
  users ||--o{ private_vehicles : owns
  hubs ||--o{ vehicles : located_at
  hubs ||--o{ parking_spaces : contains
  hubs ||--o{ charging_points : contains
  vehicles o|--o| parking_spaces : occupies
  private_vehicles o|--o| parking_spaces : occupies
  users {
    uuid id PK
    text email UK
    text role
    text password_hash
    boolean active
  }
  sessions {
    text token_hash PK
    uuid user_id FK
    timestamptz expires_at
  }
  hubs {
    uuid id PK
    text code UK
    text name
    text location
    text status
  }
  vehicles {
    uuid id PK
    text code UK
    uuid hub_id FK
    text type
    int battery_percent
    text status
  }
  private_vehicles {
    uuid id PK
    uuid owner_id FK
    text code UK
    text type
    integer battery_percent "nullable; pin khai báo"
  }
  parking_spaces {
    uuid id PK
    uuid hub_id FK
    text code
    text status
    uuid vehicle_id FK,UK
    uuid private_vehicle_id FK,UK
    timestamptz hold_expires_at
  }
  charging_points {
    uuid id PK
    uuid hub_id FK
    text code
    text status
  }
  settings {
    text key PK
    jsonb value
  }
```

Vehicle hub_id có thể null khi đang đi; quan hệ Hub/vehicle thực tế là tùy chọn phía vehicle. Một chỗ occupied chứa đúng một xe thuê hoặc cá nhân. `(hub_id,code)` unique với chỗ đỗ/cổng sạc; FK đã có index phù hợp. Database chặn pin ngoài 0–100 và trạng thái không hợp lệ.

Schema chưa có constraint kiểm tra xe đỗ cùng Hub; caller và allocation service phải giữ invariant này trong transaction. Migration 002 bổ sung bảng đặt chỗ và exclusion constraints; base schema 001 riêng vẫn không phải cơ chế chống đặt trùng đầy đủ.

## Mai Anh — dữ liệu và hành vi tuần 1

```mermaid
erDiagram
  users ||--o{ parking_bookings : owns
  private_vehicles ||--o{ parking_bookings : reserves
  parking_spaces ||--o{ parking_bookings : scheduled
  users ||--o{ charging_requests : submits
  hubs ||--o{ charging_requests : receives
  vehicles o|--o{ charging_requests : rental
  private_vehicles o|--o{ charging_requests : private
  charging_requests ||--o{ charging_sessions : has
  charging_points ||--o{ charging_sessions : serves
  users ||--o{ mobility_idempotency : deduplicates
```

charging_requests có đúng một trong vehicle_id/private_vehicle_id; partial unique index chặn hai yêu cầu active cho cùng xe. charging_sessions mới có schema/constraint cho tuần 2, chưa có scheduler hay API chạy phiên. parking_bookings có starts_at/ends_at và exclusion constraints theo chỗ/xe cho reserved/checked_in; lịch tương lai không cập nhật trạng thái parking_spaces.

```mermaid
stateDiagram-v2
  [*] --> reserved: đặt và còn chỗ
  reserved --> cancelled: chủ lịch hủy
  reserved --> checked_in: đúng giờ và chiếm được chỗ
  checked_in --> completed: check-out và giải phóng chỗ
```

```mermaid
sequenceDiagram
  actor Student
  participant UI
  participant Hook
  participant Service as MobilityService
  participant Repo as MobilityRepository
  participant DB as PostgreSQL
  Student->>UI: đặt lịch
  UI->>Hook: onSubmit
  Hook->>Service: POST + session + Idempotency-Key
  Service->>Repo: transaction
  Repo->>DB: lock key, lock Hub, đọc xe/chỗ
  Service->>Service: kiểm tra chủ xe, thời gian, sức chứa
  Repo->>DB: INSERT lịch + kết quả idempotency
  DB-->>Repo: COMMIT hoặc ROLLBACK
  Service-->>Hook: response hoặc lỗi
  Hook-->>UI: cập nhật danh sách/thông báo
```

Trong triển khai HTTP thực, request đi qua global auth guard và controller/DTO trước service. Xem docs/api.md và docs/guides/CONTRIBUTING.md cho chính sách chỗ vật lý và điểm tích hợp AllocationPort.

## Vòng đời dự kiến cho TV2

```mermaid
stateDiagram-v2
  available --> reserved: giữ xe nguyên tử
  reserved --> available: hủy / hết hạn
  reserved --> in_use: nhận xe hợp lệ
  in_use --> available: trả xe và có chỗ
  available --> charging: bắt đầu sạc
  charging --> available: hoàn thành sạc
  available --> redistributing: bắt đầu điều chuyển
  redistributing --> available: hoàn thành
  available --> maintenance: phát hiện hỏng
  maintenance --> available: xử lý xong và kiểm tra xe
```

Các chuyển trạng thái trên là baseline thiết kế, chưa phải service đã chạy. Trường hợp sự cố khi reserved/in_use/charging cần chủ module thiết kế thêm; không cho phép cập nhật status tùy ý.

## Thuê xe: reservation và trip (T06, migration 003)

- `vehicle_reservations`: `active → cancelled | expired | fulfilled`; unique index một lượt `active` cho mỗi xe; `closed_at` chỉ có khi đã kết thúc.
- `trips`: `active → completed`; một reservation tạo tối đa một trip (`reservation_id UNIQUE`); trip `completed` bắt buộc có `ended_at`, Hub đích và pin cuối.
- Quy tắc trạng thái nằm ở `apps/api/src/rental/rental.rules.ts`; trạng thái xe đổi theo sự kiện reserve/cancel/expire/pickup/return và phải cập nhật có điều kiện (`WHERE status = from`).
- Settings cần có: `reservationHoldMinutes`, `minimumRentalBatteryPercent` (seed trong `database/seed.example.json`).
