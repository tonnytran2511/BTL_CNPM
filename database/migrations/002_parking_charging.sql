-- T09-T11: future schedules are separate from physical occupancy.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE private_vehicles ADD COLUMN battery_percent integer
  CHECK (battery_percent BETWEEN 0 AND 100);
CREATE TABLE parking_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  private_vehicle_id uuid NOT NULL REFERENCES private_vehicles(id),
  parking_space_id uuid NOT NULL REFERENCES parking_spaces(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','checked_in','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  EXCLUDE USING gist (parking_space_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (status IN ('reserved','checked_in')),
  EXCLUDE USING gist (private_vehicle_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (status IN ('reserved','checked_in'))
);
CREATE INDEX parking_bookings_user_idx ON parking_bookings(user_id, starts_at);
CREATE TABLE charging_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  hub_id uuid NOT NULL REFERENCES hubs(id),
  vehicle_id uuid REFERENCES vehicles(id),
  private_vehicle_id uuid REFERENCES private_vehicles(id),
  target_battery_percent integer NOT NULL CHECK (target_battery_percent BETWEEN 1 AND 100),
  required_by timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','allocated','fulfilled','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(vehicle_id, private_vehicle_id) = 1)
);
CREATE UNIQUE INDEX charging_active_rental_idx ON charging_requests(vehicle_id)
  WHERE status IN ('queued','allocated');
CREATE UNIQUE INDEX charging_active_private_idx ON charging_requests(private_vehicle_id)
  WHERE status IN ('queued','allocated');
CREATE TABLE charging_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES charging_requests(id),
  charging_point_id uuid NOT NULL REFERENCES charging_points(id),
  status text NOT NULL CHECK (status IN ('scheduled','charging','completed','interrupted','cancelled')),
  started_at timestamptz,
  ended_at timestamptz
);
CREATE UNIQUE INDEX charging_session_request_idx ON charging_sessions(request_id)
  WHERE status IN ('scheduled','charging');
CREATE UNIQUE INDEX charging_session_point_idx ON charging_sessions(charging_point_id)
  WHERE status IN ('scheduled','charging');
CREATE TABLE mobility_idempotency (
  actor_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  payload text NOT NULL,
  response jsonb NOT NULL,
  PRIMARY KEY(actor_id,operation,key)
);
