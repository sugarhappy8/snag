import { describe, expect, it } from 'vitest';
import { dealLabel, discountPct, itemStatus, shouldAlert, targetMet, targetPrice } from '../src/rules';
import { parseGame, steamAppIdFromInput } from '../src/prices';
import { safeNext } from '../src/auth';

const p = (current: number | null, retail: number | null = 59.99, low: number | null = 19.99) => ({ current, retail, low });

describe('targets', () => {
  it('price rule', () => {
    expect(targetMet('price', 20, p(19.99))).toBe(true);
    expect(targetMet('price', 20, p(20))).toBe(true);
    expect(targetMet('price', 20, p(20.01))).toBe(false);
  });
  it('percent rule uses full price', () => {
    expect(targetPrice('percent', 50, p(30))).toBe(30);
    expect(targetMet('percent', 50, p(29.99))).toBe(true);
    expect(targetMet('percent', 50, p(30.5))).toBe(false);
    expect(targetMet('percent', 50, p(10, null))).toBe(false);
  });
  it('any discount', () => {
    expect(targetMet('any', null, p(59.99))).toBe(false);
    expect(targetMet('any', null, p(59.49))).toBe(true);
  });
  it('historical low', () => {
    expect(targetMet('historical_low', null, p(19.99))).toBe(true);
    expect(targetMet('historical_low', null, p(24.99))).toBe(false);
    expect(targetMet('historical_low', null, p(10, 59.99, null))).toBe(false);
  });
});

describe('status', () => {
  it('orders states', () => {
    expect(itemStatus('owned', 'price', 20, p(10))).toBe('OWNED');
    expect(itemStatus('purchased', 'price', 20, p(10))).toBe('PURCHASED');
    expect(itemStatus('tracking', 'price', 20, p(null))).toBe('NO PRICE');
    expect(itemStatus('tracking', 'price', 20, p(19))).toBe('TARGET HIT');
    expect(itemStatus('tracking', 'price', 10, p(19.99))).toBe('HISTORICAL LOW');
    expect(itemStatus('tracking', 'price', 20, p(21.5))).toBe('CLOSE');
    expect(itemStatus('tracking', 'price', 20, p(40))).toBe('WAIT');
  });
});

describe('alerts', () => {
  it('alerts once per drop', () => {
    expect(shouldAlert(true, 19, null)).toBe(true);
    expect(shouldAlert(true, 19, 19)).toBe(false);
    expect(shouldAlert(true, 18, 19)).toBe(true);
    expect(shouldAlert(false, 18, null)).toBe(false);
  });
});

describe('deal labels', () => {
  const now = Date.UTC(2026, 9, 1);
  it('labels from history, not % off', () => {
    expect(dealLabel({ ...p(19.99), lowDate: now - 86400_000 }, now)).toBe('New historical low');
    expect(dealLabel({ ...p(19.99), lowDate: now - 90 * 86400_000 }, now)).toBe('Historical low');
    expect(dealLabel(p(21.5), now)).toBe('Near historical low');
    expect(dealLabel(p(29.99, 59.99, 9.99), now)).toBe('Good deal');
    expect(dealLabel(p(49.99, 59.99, 9.99), now)).toBe('On sale');
    expect(dealLabel(p(59.99, 59.99, 9.99), now)).toBe('Normal price');
  });
  it('discount pct', () => {
    expect(discountPct(29.99, 59.99)).toBe(50);
    expect(discountPct(null, 59.99)).toBeNull();
  });
});

describe('cheapshark parsing', () => {
  it('picks cheapest deal and Steam full price', () => {
    const g = parseGame('612', {
      info: { title: 'LEGO Batman', steamAppID: '21000', thumb: 'x.jpg' },
      cheapestPriceEver: { price: '3.99', date: 1543028665 },
      deals: [
        { storeID: '1', dealID: 'a', price: '19.99', retailPrice: '19.99' },
        { storeID: '7', dealID: 'b', price: '4.99', retailPrice: '24.99' },
      ],
    })!;
    expect(g.current).toBe(4.99);
    expect(g.storeId).toBe('7');
    expect(g.retail).toBe(19.99);
    expect(g.low).toBe(3.99);
    expect(g.lowDate).toBe(1543028665000);
  });
  it('steam url detection', () => {
    expect(steamAppIdFromInput('https://store.steampowered.com/app/1245620/ELDEN_RING/')).toBe('1245620');
    expect(steamAppIdFromInput('elden ring')).toBeNull();
  });
});

describe('safeNext', () => {
  it('blocks open redirects', () => {
    expect(safeNext('/app/item/1')).toBe('/app/item/1');
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('/\\evil.com')).toBe('/app');
    expect(safeNext('https://evil.com')).toBe('/app');
  });
});
