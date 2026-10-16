-- Diario di trading, sfida della settimana con badge, registrazione delle Piazze.

CREATE TABLE trades (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  market        TEXT NOT NULL CHECK (market IN ('azioni', 'etf', 'forex', 'materie_prime', 'indici', 'crypto', 'altro')),
  direction     TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price   NUMERIC NOT NULL,
  stop_loss     NUMERIC NOT NULL,
  take_profit   NUMERIC,
  exit_price    NUMERIC,
  risk_percent  NUMERIC NOT NULL,
  plan          TEXT NOT NULL DEFAULT '',
  lesson        TEXT NOT NULL DEFAULT '',
  emotion       TEXT,
  followed_plan BOOLEAN,
  moved_stop    BOOLEAN,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trades_user_idx ON trades (user_id, opened_at DESC);

-- Un post può mostrare un'operazione del diario.
ALTER TABLE posts ADD COLUMN trade_id BIGINT REFERENCES trades(id) ON DELETE SET NULL;

CREATE TABLE challenges (
  id            BIGSERIAL PRIMARY KEY,
  preset_key    TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  rule          TEXT NOT NULL,
  emoji         TEXT NOT NULL,
  required_days INTEGER NOT NULL DEFAULT 5,
  starts_on     DATE NOT NULL UNIQUE,
  ends_on       DATE NOT NULL,
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE challenge_participants (
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE challenge_checkins (
  challenge_id BIGINT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  kept         BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id, day)
);

CREATE TABLE user_badges (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  challenge_id BIGINT REFERENCES challenges(id) ON DELETE SET NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id)
);

ALTER TABLE rooms ADD COLUMN record BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE recordings (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  egress_id   TEXT,
  file_name   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'processing', 'ready', 'failed')),
  duration    INTEGER,
  size_bytes  BIGINT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  removed_at  TIMESTAMPTZ
);
