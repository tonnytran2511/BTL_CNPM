-- T06: vehicle reservation and trip model (BR-01, BR-02, BR-03, BR-10).
-- Vehicle location/status stay in `vehicles`; these tables record who holds or rides a vehicle.
CREATE TABLE vehicle_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  source_hub_id uuid NOT NULL REFERENCES hubs(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','fulfilled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((status = 'active') = (closed_at IS NULL))
);
-- BR-01 / rule 1: a vehicle has at most one active reservation, enforced by the database.
CREATE UNIQUE INDEX vehicle_reservations_active_vehicle_idx
  ON vehicle_reservations(vehicle_id) WHERE status = 'active';
CREATE INDEX vehicle_reservations_user_idx ON vehicle_reservations(user_id, created_at DESC);
CREATE INDEX vehicle_reservations_expiry_idx
  ON vehicle_reservations(expires_at) WHERE status = 'active';

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One reservation can produce at most one trip (BR-02: repeated pickup must not duplicate).
  reservation_id uuid NOT NULL UNIQUE REFERENCES vehicle_reservations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  source_hub_id uuid NOT NULL REFERENCES hubs(id),
  target_hub_id uuid REFERENCES hubs(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_battery_percent integer NOT NULL CHECK (start_battery_percent BETWEEN 0 AND 100),
  end_battery_percent integer CHECK (end_battery_percent BETWEEN 0 AND 100),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK ((status = 'completed') = (ended_at IS NOT NULL)),
  CHECK ((status = 'completed') = (target_hub_id IS NOT NULL)),
  CHECK ((status = 'completed') = (end_battery_percent IS NOT NULL))
);
CREATE UNIQUE INDEX trips_active_vehicle_idx ON trips(vehicle_id) WHERE status = 'active';
CREATE INDEX trips_user_idx ON trips(user_id, started_at DESC);
