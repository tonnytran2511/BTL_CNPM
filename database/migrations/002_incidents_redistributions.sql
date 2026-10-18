CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('vehicle','charging_point','hub')),
  resource_id uuid NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  reported_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX incidents_resource_open_idx ON incidents(resource_type, resource_id) WHERE status='open';
CREATE INDEX incidents_created_at_idx ON incidents(created_at DESC);

CREATE TABLE redistributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hub_id uuid NOT NULL REFERENCES hubs(id),
  target_hub_id uuid NOT NULL REFERENCES hubs(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (source_hub_id <> target_hub_id),
  CHECK ((status IN ('in_progress','completed')) = (started_at IS NOT NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE TABLE redistribution_vehicles (
  redistribution_id uuid NOT NULL REFERENCES redistributions(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  PRIMARY KEY (redistribution_id, vehicle_id)
);
