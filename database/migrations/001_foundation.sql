CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  role text NOT NULL CHECK (role IN ('student', 'operator')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
CREATE TABLE hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  location text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  hub_id uuid REFERENCES hubs(id),
  type text NOT NULL CHECK (type IN ('electric_bicycle', 'electric_motorcycle')),
  battery_percent integer NOT NULL CHECK (battery_percent BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('available','reserved','in_use','charging','maintenance','redistributing')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_hub_status_idx ON vehicles(hub_id, status);
CREATE TABLE private_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('electric_bicycle', 'electric_motorcycle'))
);
CREATE INDEX private_vehicles_owner_idx ON private_vehicles(owner_id);
CREATE TABLE parking_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES hubs(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','held')),
  vehicle_id uuid UNIQUE REFERENCES vehicles(id),
  private_vehicle_id uuid UNIQUE REFERENCES private_vehicles(id),
  hold_expires_at timestamptz,
  UNIQUE (hub_id, code),
  CHECK (num_nonnulls(vehicle_id, private_vehicle_id) <= 1),
  CHECK ((status = 'occupied' AND num_nonnulls(vehicle_id, private_vehicle_id) = 1)
    OR (status <> 'occupied' AND num_nonnulls(vehicle_id, private_vehicle_id) = 0)),
  CHECK ((status = 'held') = (hold_expires_at IS NOT NULL))
);
CREATE INDEX parking_spaces_hub_status_idx ON parking_spaces(hub_id, status);
CREATE TABLE charging_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES hubs(id),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','failed')),
  UNIQUE (hub_id, code)
);
CREATE INDEX charging_points_hub_status_idx ON charging_points(hub_id, status);

-- Core tables only. Module owners add reservations/trips/charging sessions,
-- incidents/redistribution and simulation runs through subsequent migrations.
