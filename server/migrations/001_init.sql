-- Schema iniziale: utenti, inviti, post, Piazze live, moderazione, notifiche.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  interests     TEXT[] NOT NULL DEFAULT '{}',
  avatar_url    TEXT,
  birth_date    DATE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  invites_left  INT NOT NULL DEFAULT 3,
  invited_by    BIGINT REFERENCES users(id),
  invite_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  rules_version TEXT NOT NULL,
  banned_at     TIMESTAMPTZ,
  ban_reason    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invites (
  code        TEXT PRIMARY KEY,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  used_by     BIGINT REFERENCES users(id),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  author_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL DEFAULT '',
  media_url   TEXT,
  media_type  TEXT CHECK (media_type IN ('image', 'video')),
  flagged     BOOLEAN NOT NULL DEFAULT FALSE,
  removed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_created_idx ON posts (created_at DESC);
CREATE INDEX posts_author_idx ON posts (author_id, created_at DESC);

CREATE TABLE likes (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE comments (
  id         BIGSERIAL PRIMARY KEY,
  post_id    BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  flagged    BOOLEAN NOT NULL DEFAULT FALSE,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON comments (post_id, created_at);

-- Piazze: stanze live con al massimo 6 persone sul palco.
CREATE TABLE rooms (
  id           BIGSERIAL PRIMARY KEY,
  host_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  topic        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  removed_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rooms_status_idx ON rooms (status, scheduled_at);

CREATE TABLE room_members (
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('host', 'speaker', 'audience')),
  hand_raised_at TIMESTAMPTZ,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Segnalazioni e decisioni di moderazione (Digital Services Act: motivazione delle decisioni).
CREATE TABLE reports (
  id          BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'user', 'room')),
  target_id   BIGINT NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at);

CREATE TABLE moderation_actions (
  id           BIGSERIAL PRIMARY KEY,
  moderator_id BIGINT NOT NULL REFERENCES users(id),
  report_id    BIGINT REFERENCES reports(id),
  target_type  TEXT NOT NULL,
  target_id    BIGINT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('remove', 'ban', 'dismiss')),
  statement    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  message    TEXT NOT NULL,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
