CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  display_name text NOT NULL, crew text NOT NULL CHECK (crew IN ('VSBL','EDGE','QA','UI','SUPPORT','CNCT','ANEXYA_LOVER')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id, crew)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS kings (
  user_id text PRIMARY KEY, crew text NOT NULL UNIQUE,
  FOREIGN KEY (user_id, crew) REFERENCES users(id, crew) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS signup_verifications (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  display_name text NOT NULL, crew text NOT NULL,
  code_hash text NOT NULL, expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0, sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), sent_count integer NOT NULL DEFAULT 1
);
ALTER TABLE signup_verifications ADD COLUMN IF NOT EXISTS handle text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE SEQUENCE IF NOT EXISTS workshop_handle_seq;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle text CHECK (handle ~ '^[a-z][a-z0-9_]{2,39}$');
UPDATE users SET handle='elf_' || nextval('workshop_handle_seq')::text WHERE handle IS NULL;
ALTER TABLE users ALTER COLUMN handle SET NOT NULL;
ALTER TABLE users ALTER COLUMN handle SET DEFAULT ('elf_' || nextval('workshop_handle_seq')::text);
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users(handle);
ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_public text;
CREATE TABLE IF NOT EXISTS profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL, titles jsonb NOT NULL DEFAULT '[]', merged_local boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_removed jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS room_acl (
  room_id text NOT NULL CHECK (room_id IN ('vsbl','edge','support','cnct','qa','ui')),
  subject_id text NOT NULL, allowed_until timestamptz, kicked_at timestamptz,
  PRIMARY KEY(room_id, subject_id)
);
-- Guests are intentionally absent here: their knocks and all other data remain in memory.
CREATE TABLE IF NOT EXISTS knocks (
  id text PRIMARY KEY, room_id text NOT NULL, subject_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','allowed','denied')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS live_events (
  id text PRIMARY KEY, title text NOT NULL, body text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, enabled boolean NOT NULL DEFAULT false,
  kind text NOT NULL CHECK (kind IN ('challenge','opt-in','announcement')),
  metric text NOT NULL DEFAULT 'sends' CHECK (metric IN ('sends','handheld','opened','trades','given')),
  target integer NOT NULL DEFAULT 1 CHECK (target > 0), reward jsonb, crews jsonb,
  opt_in boolean NOT NULL DEFAULT false, pairing text CHECK (pairing = 'same-crew'), CHECK (end_at > start_at)
);
CREATE TABLE IF NOT EXISTS event_progress (
  event_id text NOT NULL REFERENCES live_events(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value integer NOT NULL DEFAULT 0, opted_in boolean NOT NULL DEFAULT false,
  rewarded boolean NOT NULL DEFAULT false, baseline integer NOT NULL DEFAULT 0,
  recipient_id text REFERENCES users(id), PRIMARY KEY(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS mission_progress (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id text NOT NULL, period_key text NOT NULL,
  baseline integer NOT NULL CHECK (baseline >= 0),
  claimed boolean NOT NULL DEFAULT false, claimed_at timestamptz,
  PRIMARY KEY(user_id, mission_id, period_key)
);
CREATE INDEX IF NOT EXISTS mission_progress_period ON mission_progress(period_key);
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY, pair text NOT NULL, from_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, name text NOT NULL,
  text text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_pair_at ON messages(pair, at);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE TABLE IF NOT EXISTS friend_links (
  user_a text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_a,user_b), CHECK(user_a<user_b), CHECK(requested_by IN (user_a,user_b))
);
CREATE INDEX IF NOT EXISTS friend_links_user_b ON friend_links(user_b);
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(blocker,blocked), CHECK(blocker<>blocked)
);
-- Keep these tables server-only even when installed into the existing Supabase database.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE kings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE knocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_progress ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS letters (
  id text PRIMARY KEY,
  from_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS letters_inbox ON letters(to_id, created_at DESC);
ALTER TABLE letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
