-- T22: scenario results are separate from operational data. No Hub FK:
-- saved evidence must remain readable after a resource has been deleted.
CREATE TABLE simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  payload text NOT NULL,
  UNIQUE (created_by, idempotency_key)
);
CREATE INDEX simulation_runs_page_idx ON simulation_runs(created_at DESC, id DESC);
INSERT INTO settings(key,value) VALUES
  ('simulationMaximumGeneratedRequests','100000'),
  ('simulationMaximumHorizonMinutes','10080'),
  ('simulationHistoryPageSize','20')
ON CONFLICT(key) DO NOTHING;
