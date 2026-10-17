-- Sicurezza degli accessi: email confermata con codice, accesso a due fattori (app di autenticazione),
-- ultimo accesso e "esci da tutti i dispositivi" per il pannello utenti degli amministratori.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
-- Chi era già iscritto prima di questa novità conta come verificato.
UPDATE users SET email_verified_at = created_at;

ALTER TABLE users ADD COLUMN totp_secret TEXT;          -- cifrato, presente solo con i due fattori attivi
ALTER TABLE users ADD COLUMN totp_pending TEXT;         -- cifrato, durante la configurazione
ALTER TABLE users ADD COLUMN totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN totp_last_step BIGINT;     -- lo stesso codice non vale due volte
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN sessions_revoked_at TIMESTAMPTZ;

CREATE TABLE email_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify')),
  code_hash   TEXT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_codes_user ON email_codes (user_id, purpose, created_at DESC);

CREATE TABLE recovery_codes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TIMESTAMPTZ
);
CREATE INDEX recovery_codes_user ON recovery_codes (user_id);

-- Tentativi di codice a due fattori: si blocca dopo troppi errori.
CREATE TABLE login_challenges (
  id          TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check
  CHECK (action IN ('remove', 'ban', 'dismiss', 'reinstate', 'reset_2fa', 'logout', 'verify_email'));
