CREATE TABLE operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type text NOT NULL CHECK (command_type IN ('incident','redistribution')),
  command_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','resolved','started','cancelled','completed')),
  actor_id uuid NOT NULL REFERENCES users(id),
  from_status text,
  to_status text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operation_logs_command_idx ON operation_logs(command_type,command_id,occurred_at,id);
CREATE INDEX operation_logs_occurred_at_idx ON operation_logs(occurred_at DESC,id DESC);
