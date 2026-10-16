-- Strumenti per amministratori: rimozione immediata (senza segnalazione) e riattivazione degli account sospesi.
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check CHECK (action IN ('remove', 'ban', 'dismiss', 'reinstate'));
