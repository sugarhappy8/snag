export interface Env {
  DB: D1Database;
  APP_URL: string;
  FROM_EMAIL: string;
  AUTH_SECRET: string;
  RESEND_API_KEY?: string;
  /** Override for tests/local mocks. Defaults to the public CheapShark API. */
  CHEAPSHARK_API?: string;
  /** Steam Web API key (steamcommunity.com/dev/apikey). Needed to read owned games. */
  STEAM_API_KEY?: string;
  /** Override for tests/local mocks. */
  STEAM_API?: string;
}

export interface User {
  id: string;
  email: string;
  email_alerts: number;
  created_at: number;
}

export interface Game {
  id: string;
  title: string;
  thumb: string | null;
  steam_app_id: string | null;
  current_price: number | null;
  retail_price: number | null;
  current_store_id: string | null;
  current_deal_id: string | null;
  historical_low: number | null;
  historical_low_date: number | null;
  last_checked: number | null;
  created_at: number;
}

export type ItemState = 'tracking' | 'owned' | 'purchased';

export interface WishlistItem {
  id: string;
  user_id: string;
  game_id: string;
  rule: string;
  target_value: number | null;
  state: ItemState;
  purchased_price: number | null;
  retail_at_purchase: number | null;
  purchased_at: number | null;
  last_alert_price: number | null;
  last_alert_at: number | null;
  created_at: number;
  source: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
