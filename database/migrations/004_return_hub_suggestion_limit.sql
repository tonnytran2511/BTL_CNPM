-- Preserve the existing T08 default as persisted, editable operational configuration.
INSERT INTO settings(key, value)
VALUES ('returnHubSuggestionLimit', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;
