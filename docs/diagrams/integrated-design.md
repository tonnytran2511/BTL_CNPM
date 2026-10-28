# Thiết kế tích hợp đối chiếu code ngày 28/10/2026

Các sơ đồ mô tả bản main `376b160` và kiểm thử ứng viên T23/T29. Source sự kiện/SQL tại `apps/api/src` và `database/migrations`; sơ đồ UC theo hai file PlantUML cùng thư mục. Pin quan sát có đơn vị %, thời gian API UTC, sức chứa là số chỗ/cổng thực.

## Các module và hướng phụ thuộc

```mermaid
flowchart TB
  UI[React components/pages] --> Hook[Hooks + presentation models]
  Hook --> Client[API client: cookie, deadline, lỗi chuẩn]
  Client --> Guard[Nest AuthGuard + controller/DTO]
  Guard --> Hub[Hubs / HubManagement]
  Guard --> Rental[Reservation / Trip / Rental]
  Guard --> Mobility[Mobility / ChargingWorkflow / ChargingFailure]
  Guard --> Ops[Operations]
  Guard --> Sim[Simulation]
  Rental --> Allocation[AllocationPort của Mobility]
  Ops --> Allocation
  Ops --> Rental
  Ops --> Mobility
  Mobility --> RentalCharge[RentalChargingService]
  Mobility --> Incident[ChargingIncidentService]
  Sim --> Hub
  Sim --> Projection[MobilitySnapshotService + rental projection]
  Projection --> Mobility
  Sim --> Engine[Engine thuần: resource-flow-v1 / departures-v1]
  Hub --> Repos[Repository của từng module]
  Rental --> Repos
  Mobility --> Repos
  Ops --> Repos
  Sim --> History[SimulationRepository]
  Repos --> Operational[(PostgreSQL: trạng thái vận hành)]
  History --> Saved[(PostgreSQL: simulation_runs riêng)]
```

AuthGuard chạy trước DTO/controller. Các cạnh nghiệp vụ cần nguyên tử dùng cùng PoolClient, không gọi HTTP nội bộ. Snapshot sử dụng một REPEATABLE READ READ ONLY; lưu run là transaction riêng, không có cạnh từ Engine về vận hành.

## Class diagram ở mức thiết kế

```mermaid
classDiagram
  class TripService {
    +pickup(userId, reservationId, key)
    +returnVehicle(userId, tripId, targetHubId, key)
    +list(userId)
  }
  class ReservationService {
    +reserve(userId, vehicleId, key)
    +cancel(userId, reservationId, key)
  }
  class RentalRepository {
    +inTransaction(work)
  }
  class RentalTx {
    +lockIdempotencyKey(actorId, operation, key)
    +findIdempotentResponse(actorId, operation, key)
    +saveIdempotentResponse(actorId, operation, key, payload, response)
  }
  class AllocationPort {
    <<interface>>
    +releaseRentalVehicleSpace(vehicleId, hubId, client)
    +claimRentalVehicleSpace(vehicleId, hubId, client)
  }
  class MobilityService {
    +reserve(user, input, key)
    +transition(user, bookingId, action, key)
    +charge(user, input, key)
    +releaseRentalVehicleSpace(vehicleId, hubId, client)
    +claimRentalVehicleSpace(vehicleId, hubId, client)
  }
  class OperationsService {
    +createRedistribution(input, actorId)
    +startRedistribution(id, actorId)
    +completeRedistribution(id, actorId)
    +createIncident(input, actorId, key)
  }
  class ChargingWorkflowService {
    +schedule(user, hubId, key)
    +transition(user, sessionId, action, battery, key)
    +simulationQueue(client, hubId, capturedAt)
  }
  class ChargingAllocationService {
    +allocatePrivateRequest(user, requestId, pointId, client)
    +allocateRentalRequest(user, requestId, pointId, client)
  }
  class ChargingFailureService {
    +report(actor, pointId, input, key)
    +recover(actor, pointId, key)
  }
  class RentalChargingService {
    +candidates(client)
    +release(client, vehicleId, hubId, battery)
  }
  class SimulationService {
    +scenario(parameters, actor, key)
  }
  class SimulationRepository {
    +readSnapshot(work)
    +save(actor, key, payload, snapshot, result)
  }
  class MobilitySnapshotService {
    +project(client, hubIds, horizonMinutes, capturedAt, minimumBatteryPercent)
  }
  TripService --> RentalRepository
  ReservationService --> RentalRepository
  RentalRepository ..> RentalTx : transaction callback
  TripService --> AllocationPort
  MobilityService ..|> AllocationPort
  OperationsService --> AllocationPort
  OperationsService --> ChargingFailureService
  ChargingWorkflowService --> ChargingAllocationService
  ChargingWorkflowService --> RentalChargingService
  ChargingFailureService --> RentalChargingService
  SimulationService --> SimulationRepository
  SimulationService --> MobilitySnapshotService
  MobilitySnapshotService --> ChargingWorkflowService : read-only queue
  MobilitySnapshotService --> RentalChargingService : read-only fleet
```

Đây là dependency giữa service stateless, không gán multiplicity domain vào các dependency. Multiplicity entity và FK nằm trong ERD bên dưới. Phương thức/class đại diện đã đối chiếu source; sơ đồ không liệt kê mọi controller/repository.

## ERD toàn hệ thống

```mermaid
erDiagram
  users ||--o{ sessions : authenticates
  users ||--o{ private_vehicles : owns
  hubs o|--o{ vehicles : locates
  hubs ||--o{ parking_spaces : contains
  hubs ||--o{ charging_points : contains
  vehicles o|--o| parking_spaces : occupies
  private_vehicles o|--o| parking_spaces : occupies
  users ||--o{ vehicle_reservations : reserves
  vehicles ||--o{ vehicle_reservations : receives
  hubs ||--o{ vehicle_reservations : source
  vehicle_reservations ||--o| trips : creates
  users ||--o{ trips : rides
  vehicles ||--o{ trips : used_by
  hubs ||--o{ trips : source
  hubs o|--o{ trips : destination
  users ||--o{ parking_bookings : books
  private_vehicles ||--o{ parking_bookings : schedules
  parking_spaces ||--o{ parking_bookings : allocated
  users ||--o{ charging_requests : requests
  hubs ||--o{ charging_requests : receives
  vehicles o|--o{ charging_requests : rental
  private_vehicles o|--o{ charging_requests : private
  charging_requests ||--o{ charging_sessions : attempts
  charging_points ||--o{ charging_sessions : serves
  users ||--o{ incidents : reports
  users ||--o{ redistributions : creates
  hubs ||--o{ redistributions : source
  hubs ||--o{ redistributions : destination
  redistributions ||--o{ redistribution_vehicles : contains
  vehicles ||--o{ redistribution_vehicles : moves
  users ||--o{ operation_logs : acts
  users ||--o{ mobility_idempotency : retries
  users ||--o{ rental_idempotency : retries
  users ||--o{ simulation_runs : runs
  vehicle_reservations {
    uuid id PK
    uuid user_id FK
    uuid vehicle_id FK
    uuid source_hub_id FK
    text status
    timestamptz expires_at
  }
  trips {
    uuid id PK
    uuid reservation_id FK,UK
    uuid vehicle_id FK
    uuid user_id FK
    uuid source_hub_id FK
    uuid target_hub_id FK
    text status
  }
  parking_bookings {
    uuid id PK
    uuid user_id FK
    uuid private_vehicle_id FK
    uuid parking_space_id FK
    timestamptz starts_at
    timestamptz ends_at
    text status
  }
  charging_requests {
    uuid id PK
    uuid user_id FK
    uuid hub_id FK
    uuid vehicle_id FK
    uuid private_vehicle_id FK
    int target_battery_percent
    text status
  }
  charging_sessions {
    uuid id PK
    uuid request_id FK
    uuid charging_point_id FK
    text status
    timestamptz started_at
    timestamptz ended_at
  }
  incidents {
    uuid id PK
    text resource_type
    uuid resource_id
    uuid reported_by FK
    text status
  }
  redistributions {
    uuid id PK
    uuid source_hub_id FK
    uuid target_hub_id FK
    uuid created_by FK
    text status
  }
  redistribution_vehicles {
    uuid redistribution_id PK,FK
    uuid vehicle_id PK,FK
  }
  operation_logs {
    uuid id PK
    uuid actor_id FK
    uuid command_id
    text command_type
    text from_status
    text to_status
    timestamptz occurred_at
  }
  simulation_runs {
    uuid id PK
    uuid created_by FK
    jsonb snapshot
    jsonb result
    text idempotency_key
    timestamptz created_at
  }
```

Cột nền tảng users/sessions/hubs/vehicles/parking_spaces/charging_points/settings tại ERD trong architecture.md. `resource_id`/`command_id` đa hình do service kiểm tra, không có FK đa bảng. Mỗi charging_request có đúng một loại xe; một chỗ occupied chứa đúng một loại xe. Hệ số `o{` ở redistribution_vehicles phản ánh FK cho phép zero row trong transaction, service bắt buộc input không rỗng. Snapshot không FK Hub để history vẫn đọc được sau xóa/đổi tài nguyên. Key chống lặp scope actor + operation cho rental/mobility, actor + key cho simulation.

## Activity: phân bổ, chạy và xử lý hỏng cổng

```mermaid
flowchart TD
  A[Operator yêu cầu phân bổ Hub] --> B[Validate quyền/key/policy, BEGIN]
  B --> C[Khóa Hub, lấy queue BR-07 và cổng hợp lệ]
  C --> D{Có request và cổng?}
  D -- Không --> E[COMMIT, trả danh sách rỗng]
  D -- Có --> F[Khóa xe/request/point, kiểm tra lại trạng thái/vị trí]
  F --> G{Còn hợp lệ?}
  G -- Không --> R[ROLLBACK, lỗi có mã]
  G -- Có --> H[scheduled + allocated + occupied, xe thuê charging]
  H --> I[COMMIT, operator start]
  I --> J{Sự kiện tiếp theo}
  J -- Hoàn tất --> K[Validate pin quan sát đạt mục tiêu]
  K --> L[completed + fulfilled + free point + release rental, COMMIT]
  J -- Cổng hỏng --> M[Validate session ID/pin quan sát]
  M --> N[interrupted + failed + incident/log cùng transaction]
  N --> O{Đã đạt mục tiêu?}
  O -- Có --> P[fulfilled]
  O -- Chưa --> Q[queued, giữ thời gian chờ]
  Q --> S[Operator sửa cổng, xác nhận repair]
  S --> A
```

Bước failed/gián đoạn không tự tăng pin hoặc tự chạy lại phiên cũ. Priority là hàm thuần, ngưỡng từ settings. Trình tự khóa cụ thể ở allocation-safety.md và charging-failure-recovery.md.

## Sequence: hoàn tất điều chuyển

```mermaid
sequenceDiagram
  actor Operator
  participant UI as UI / useOperations
  participant Service as OperationsService
  participant Repo as OperationsRepository
  participant Rental as RentalService
  participant Allocation as AllocationPort
  Operator->>UI: hoàn tất lệnh
  UI->>Service: POST complete + session
  Service->>Repo: BEGIN, khóa order và Hub theo ID
  Service->>Rental: khóa/kiểm tra xe redistributing tại nguồn
  Service->>Repo: kiểm tra incident mở
  Service->>Allocation: release nguồn, claim đích với cùng PoolClient
  alt đủ chỗ và trạng thái đúng
    Service->>Rental: cập nhật Hub đích và available
    Service->>Repo: completed + log actor, COMMIT
    Service-->>UI: kết quả, tải lại dashboard/lệnh/log
  else đầy / trạng thái thay đổi / lỗi
    Service->>Repo: ROLLBACK toàn bộ
    Service-->>UI: 409 hoặc lỗi server đã che chi tiết
  end
```

## State: phiên sạc, request và lệnh

```mermaid
stateDiagram-v2
  state "Charging session" as S {
    [*] --> scheduled
    scheduled --> charging: operator start
    scheduled --> cancelled: cancel trước chạy
    charging --> completed: pin đạt target
    charging --> cancelled: hủy + pin quan sát
    scheduled --> interrupted: point failure
    charging --> interrupted: point failure + pin quan sát
  }
  state "Charging request" as R {
    [*] --> queued
    queued --> allocated: giữ cổng
    queued --> cancelled_request: operator hủy request xe thuê
    allocated --> fulfilled: hoàn tất / gián đoạn đã đạt target
    allocated --> queued: gián đoạn chưa đạt target
    allocated --> cancelled_request: hủy phiên
  }
  state "Redistribution" as D {
    [*] --> pending
    pending --> in_progress: start, giữ xe
    pending --> cancelled_order: cancel
    in_progress --> completed_order: complete + claim đích
  }
```

Vòng đời reservation/trip và sequence nhận/trả tại architecture.md. Không có cạnh in_progress → cancelled hoặc interrupted → charging: yêu cầu được phân bổ thành phiên mới.
