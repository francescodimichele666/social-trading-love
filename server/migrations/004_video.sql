-- Video nei post: copertina e durata in secondi (massimo 2 minuti, controllato dal server).
ALTER TABLE posts ADD COLUMN media_poster TEXT;
ALTER TABLE posts ADD COLUMN media_duration INTEGER;
