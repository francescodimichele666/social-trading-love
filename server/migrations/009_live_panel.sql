-- Pannello di chi conduce la Live: numeri della diretta, persone fatte uscire e persone bloccate.
ALTER TABLE rooms ADD COLUMN peak_listeners INT NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN total_visitors INT NOT NULL DEFAULT 0;

-- Fatto uscire da una Live: non può rientrare in quella Live.
CREATE TABLE room_kicks (
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Bloccato da chi conduce: non può entrare in nessuna delle sue Live finché non viene sbloccato.
CREATE TABLE host_blocks (
  host_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (host_id, user_id)
);
