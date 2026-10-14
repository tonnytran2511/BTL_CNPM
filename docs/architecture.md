# Kiến trúc và dữ liệu nền tảng

Sơ đồ này phản ánh bản đang triển khai. Các module nghiệp vụ chưa có code được liệt kê riêng trong tài liệu API và bàn giao.

```mermaid
flowchart LR
  UI[React UI] --> Hooks[Hooks / presentation models]
  Hooks --> Client[API client]
  Client --> Controllers[Nest controllers / validation]
  Controllers --> Guard[Session / role guard]
  Guard --> Services[AuthService / HubsService]
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

Schema chưa có constraint kiểm tra xe đỗ cùng Hub; các service phân bổ tương lai phải giữ invariant này trong transaction. Không gọi base schema là cơ chế chống đặt trùng hoàn chỉnh khi bảng đặt chỗ chưa được bổ sung.

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
