/**
 * Market utility functions for NSE/BSE
 * All times are in IST (UTC+5:30)
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns a Date object adjusted to IST */
export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Returns YYYY-MM-DD in IST */
export function todayIST(): string {
  return nowIST().toISOString().split('T')[0];
}

/** 0=Sun, 1=Mon … 6=Sat */
export function dayOfWeekIST(): number {
  return nowIST().getUTCDay();
}

export function isWeekend(): boolean {
  const day = dayOfWeekIST();
  return day === 0 || day === 6;
}

/**
 * NSE market session: 09:15 – 15:30 IST, Mon-Fri
 * Returns 'pre' | 'open' | 'post' | 'closed'
 */
export type MarketSession = 'pre' | 'open' | 'post' | 'closed';

export function getMarketSession(): MarketSession {
  if (isWeekend()) return 'closed';

  const ist = nowIST();
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  const mins = h * 60 + m; // minutes since UTC midnight, but we're in IST already

  // pre-open 09:00–09:15
  if (mins >= 9 * 60 && mins < 9 * 60 + 15) return 'pre';
  // market hours 09:15–15:30
  if (mins >= 9 * 60 + 15 && mins < 15 * 60 + 30) return 'open';
  // post-close 15:30–17:00
  if (mins >= 15 * 60 + 30 && mins < 17 * 60) return 'post';

  return 'closed';
}

/**
 * Get the most recent trading day (skips weekends).
 * If today is a weekday and market has opened, returns today.
 * Otherwise returns the previous weekday.
 */
export function lastTradingDay(): string {
  const ist = nowIST();
  let d = new Date(ist);

  const session = getMarketSession();
  // If it's a weekday but market hasn't opened yet, go to previous day
  const h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  const mins = h * 60 + m;
  const hasMarketData = !isWeekend() && mins >= 9 * 60 + 15;

  if (!hasMarketData) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  // Skip weekends going backwards
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return d.toISOString().split('T')[0];
}

/** Returns the last N trading days (most recent first) */
export function lastNTradingDays(n: number, excludeToday = true): string[] {
  const result: string[] = [];
  const ist = nowIST();
  let d = new Date(ist);

  // Start from yesterday if excludeToday, else from lastTradingDay
  if (excludeToday) {
    d.setUTCDate(d.getUTCDate() - 1);
  }

  while (result.length < n) {
    // Skip weekends
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      result.push(d.toISOString().split('T')[0]);
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return result;
}

export interface MarketStatus {
  isWeekend: boolean;
  session: MarketSession;
  lastTradingDay: string;
  currentDate: string;
  istTime: string;
}

export function getMarketStatus(): MarketStatus {
  const ist = nowIST();
  return {
    isWeekend: isWeekend(),
    session: getMarketSession(),
    lastTradingDay: lastTradingDay(),
    currentDate: todayIST(),
    istTime: ist.toISOString().replace('T', ' ').substring(0, 16) + ' IST',
  };
}
