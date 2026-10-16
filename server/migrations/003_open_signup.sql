-- Iscrizione libera: ogni persona ha un codice "porta un amico" personale e riutilizzabile.
ALTER TABLE users ADD COLUMN friend_code TEXT UNIQUE;
