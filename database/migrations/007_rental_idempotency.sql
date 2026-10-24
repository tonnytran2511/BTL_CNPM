-- T17 / BR-11: Idempotency-Key cho lệnh thuê xe (đặt, hủy, nhận, trả).
-- Phạm vi key: actor + operation. Chỉ lưu kết quả thành công; lỗi rollback nên cùng key được thử lại.
CREATE TABLE rental_idempotency (
  actor_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  payload text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, key)
);
