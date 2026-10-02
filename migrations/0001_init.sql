CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_alerts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- One row per CheapShark game (a canonical product across PC stores).
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  thumb TEXT,
  steam_app_id TEXT,
  current_price REAL,
  retail_price REAL,
  current_store_id TEXT,
  current_deal_id TEXT,
  historical_low REAL,
  historical_low_date INTEGER,
  last_checked INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE price_history (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  price REAL NOT NULL,
  store_id TEXT,
  checked_at INTEGER NOT NULL
);
CREATE INDEX price_history_game ON price_history(game_id, checked_at);

CREATE TABLE wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id),
  rule TEXT NOT NULL DEFAULT 'historical_low',
  target_value REAL,
  state TEXT NOT NULL DEFAULT 'tracking',
  purchased_price REAL,
  retail_at_purchase REAL,
  purchased_at INTEGER,
  last_alert_price REAL,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, game_id)
);
CREATE INDEX wishlist_game ON wishlist_items(game_id, state);

CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO stores (id, name) VALUES
  ('1', 'Steam'), ('2', 'GamersGate'), ('3', 'GreenManGaming'), ('7', 'GOG'),
  ('8', 'EA App'), ('11', 'Humble Store'), ('13', 'Ubisoft Store'), ('15', 'Fanatical'),
  ('21', 'WinGameStore'), ('23', 'GameBillet'), ('24', 'Voidu'), ('25', 'Epic Games Store'),
  ('27', 'Gamesplanet'), ('28', 'Gamesload'), ('29', '2Game'), ('30', 'IndieGala'),
  ('31', 'Blizzard Shop'), ('33', 'DLGamer'), ('34', 'Noctre'), ('35', 'DreamGame');
