-- Badge Mentore: lo danno il proprietario o un amministratore ai membri esperti.
ALTER TABLE users ADD COLUMN mentor_since TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN mentor_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check
  CHECK (action IN ('remove', 'ban', 'dismiss', 'reinstate', 'reset_2fa', 'logout', 'verify_email', 'mentor', 'unmentor'));
