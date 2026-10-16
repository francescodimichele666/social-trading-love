-- Il proprietario (il primo iscritto) è l'unico che può nominare o togliere amministratori.
ALTER TABLE users ADD COLUMN is_owner BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_owner = TRUE WHERE id = (SELECT min(id) FROM users WHERE role = 'admin');
CREATE UNIQUE INDEX users_single_owner ON users (is_owner) WHERE is_owner;
