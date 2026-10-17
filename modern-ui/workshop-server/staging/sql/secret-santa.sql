-- Secret Santa opt-in for staging. Pairing is same-crew among signed-in accounts.
INSERT INTO live_events(id, title, body, start_at, end_at, enabled, kind, metric, target, opt_in, pairing)
VALUES (
  'secret-santa-dev',
  'Secret Santa (staging)',
  'Opt in, then gift something. Progress uses the given-item stat.',
  now(),
  now() + interval '7 days',
  true,
  'opt-in',
  'given',
  1,
  true,
  'same-crew'
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
  opt_in = EXCLUDED.opt_in,
  pairing = EXCLUDED.pairing;

SELECT id, title, enabled, kind, pairing, start_at, end_at FROM live_events WHERE id = 'secret-santa-dev';
