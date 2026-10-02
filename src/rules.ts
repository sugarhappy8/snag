// Pure price-target logic. No I/O here so it is easy to test.

export type Rule = 'price' | 'percent' | 'any' | 'historical_low';

export const RULE_LABELS: Record<Rule, string> = {
  price: 'At or below a price I choose',
  percent: 'At a % discount',
  any: 'Any discount',
  historical_low: 'At its historical low',
};

export function isRule(v: unknown): v is Rule {
  return typeof v === 'string' && v in RULE_LABELS;
}

export interface PriceState {
  current: number | null;
  retail: number | null;
  low: number | null;
  lowDate?: number | null;
}

const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The price at or below which the rule is satisfied, or null if it can't be computed yet. */
export function targetPrice(rule: Rule, value: number | null, p: PriceState): number | null {
  switch (rule) {
    case 'price':
      return value;
    case 'percent':
      return p.retail != null && value != null ? round2(p.retail * (1 - value / 100)) : null;
    case 'any':
      return p.retail != null ? round2(p.retail - 0.01) : null;
    case 'historical_low':
      return p.low;
  }
}

export function targetMet(rule: Rule, value: number | null, p: PriceState): boolean {
  const t = targetPrice(rule, value, p);
  return p.current != null && t != null && p.current <= t + EPS;
}

export type Status = 'TARGET HIT' | 'HISTORICAL LOW' | 'CLOSE' | 'WAIT' | 'NO PRICE' | 'OWNED' | 'PURCHASED';

export const STATUS_ORDER: Status[] = ['TARGET HIT', 'HISTORICAL LOW', 'CLOSE', 'WAIT', 'NO PRICE', 'PURCHASED', 'OWNED'];

export function itemStatus(state: string, rule: Rule, value: number | null, p: PriceState): Status {
  if (state === 'owned') return 'OWNED';
  if (state === 'purchased') return 'PURCHASED';
  if (p.current == null) return 'NO PRICE';
  if (targetMet(rule, value, p)) return 'TARGET HIT';
  if (p.low != null && p.current <= p.low + EPS) return 'HISTORICAL LOW';
  const t = targetPrice(rule, value, p);
  if (t != null && p.current <= t * 1.1 + EPS) return 'CLOSE';
  return 'WAIT';
}

const WEEK = 7 * 24 * 3600 * 1000;

/** Answers "is this deal actually good?" from price history, not the advertised % off. */
export function dealLabel(p: PriceState, now = Date.now()): string | null {
  if (p.current == null) return null;
  if (p.low != null && p.current <= p.low + EPS) {
    return p.lowDate != null && now - p.lowDate < WEEK ? 'New historical low' : 'Historical low';
  }
  if (p.low != null && p.current <= p.low * 1.1 + EPS) return 'Near historical low';
  if (p.retail != null && p.current <= p.retail * 0.6) return 'Good deal';
  if (p.retail != null && p.current < p.retail - EPS) return 'On sale';
  return 'Normal price';
}

/** Alert once per drop: when the target is first met, then again only if the price falls further. */
export function shouldAlert(met: boolean, current: number | null, lastAlertPrice: number | null): boolean {
  if (!met || current == null) return false;
  return lastAlertPrice == null || current < lastAlertPrice - EPS;
}

export function discountPct(current: number | null, retail: number | null): number | null {
  if (current == null || retail == null || retail <= 0) return null;
  return Math.max(0, Math.round((1 - current / retail) * 100));
}

export function money(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toFixed(2)}`;
}

export function describeTarget(rule: Rule, value: number | null, p: PriceState): string {
  const t = targetPrice(rule, value, p);
  switch (rule) {
    case 'price':
      return `${money(value)} or less`;
    case 'percent':
      return `${value}% off${t != null ? ` (${money(t)})` : ''}`;
    case 'any':
      return 'Any discount';
    case 'historical_low':
      return `Historical low${t != null ? ` (${money(t)})` : ''}`;
  }
}
