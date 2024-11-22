CREATE TABLE acl_roles (
  id UUID PRIMARY KEY,
);

CREATE TABLE media (
  id UUID PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_data JSONB DEFAULT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER NOT NULL,
  thumbnail URL NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,

  UNIQUE KEY source_key(source_id, source_type)
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  active_playlist_id UUID DEFAULT NULL REFERENCES playlists(id),
  pending_activation BOOLEAN DEFAULT false,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
);

CREATE TABLE playlists (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
);

CREATE TABLE playlist_items (
  id UUID PRIMARY KEY,
  playlist_id UUID REFERENCES playlists(id),
  media_id UUID REFERENCES media(id),
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
);

CREATE TABLE history_entries (
  id UUID PRIMARY KEY,
  media_id UUID REFERENCES media(id),
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  created_at DATETIME NOT NULL
);
