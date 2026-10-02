-- Connected store accounts (Steam today).
CREATE TABLE linked_accounts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  display_name TEXT,
  owned_count INTEGER,
  wishlist_count INTEGER,
  last_synced_at INTEGER,
  sync_error TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- Store app ids the user owns on a connected account.
CREATE TABLE owned_apps (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  app_id TEXT NOT NULL,
  PRIMARY KEY (user_id, provider, app_id)
);

-- Store wishlist entries waiting to be matched to a game and added.
CREATE TABLE import_queue (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  app_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider, app_id)
);

-- Steam app id -> CheapShark game id. game_id NULL means CheapShark doesn't list it.
CREATE TABLE steam_app_map (
  app_id TEXT PRIMARY KEY,
  game_id TEXT,
  checked_at INTEGER NOT NULL
);

-- Games the user removed, so a re-sync doesn't add them back.
CREATE TABLE import_ignored (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  PRIMARY KEY (user_id, game_id)
);

ALTER TABLE wishlist_items ADD COLUMN source TEXT;
CREATE INDEX games_steam_app ON games(steam_app_id);
CREATE UNIQUE INDEX linked_external ON linked_accounts(provider, external_id);
