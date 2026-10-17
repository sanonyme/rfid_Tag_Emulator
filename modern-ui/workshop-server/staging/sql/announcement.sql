-- Sample announcement for staging. Safe to re-run.
INSERT INTO live_events(id, title, body, start_at, end_at, enabled, kind, metric, target, opt_in)
VALUES (
  'dev-banner',
  'Dev test event',
  'Staging on CT 251. If you see this banner, live events are working.',
  now(),
  now() + interval '1 day',
  true,
  'announcement',
  'sends',
  1,
  false
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  start_at = EXCLUDED.start_at,
  end_at = EXCLUDED.end_at,
  enabled = true,
  kind = EXCLUDED.kind,
  metric = EXCLUDED.metric,
  target = EXCLUDED.target,
  opt_in = EXCLUDED.opt_in;

SELECT id, title, enabled, kind, start_at, end_at FROM live_events WHERE id = 'dev-banner';
