-- Persist the operator-configurable safety limit for parking spaces per Hub.
INSERT INTO settings(key, value)
VALUES ('maxParkingCapacityPerHub', '5000'::jsonb)
ON CONFLICT (key) DO NOTHING;
