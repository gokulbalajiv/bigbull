/**
 * lib/googleFinance.ts
 *
 * Google Finance research integration.
 *
 * Google Finance has no public API, so this module:
 *  1. Generates deep-link URLs to Google Finance for each NSE stock (for manual research)
 *  2. Fetches supplemental fundamental data from Yahoo Finance quoteSummary
 *     (P/E, EPS, analyst targets, P/B, market cap) — data that the v8 chart
 *     endpoint doesn't expose
 *  3. Fetches a reliable session open price using the 1-minute interval chart
 *     (first candle at 09:15 IST) — much more accurate than the 1d candle open
 */

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the Google Finance URL for an NSE stock.
 * e.g. googleFinanceUrl('RELIANCE') → 'https://www.google.com/finance/quote/RELIANCE:NSE'
 */
export function googleFinanceUrl(ticker: string): string {
  return `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:NSE`;
}

/**
 * Returns the Google Finance news search URL for a ticker.
 */
export function googleFinanceNewsUrl(ticker: string, companyName?: string): string {
  const q = companyName ? `${companyName} NSE stock` : `${ticker} NSE India stock`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=nws`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FundamentalData {
  ticker:           string;
  symbol:           string;
  // Valuation
  trailingPE:       number | null;
  forwardPE:        number | null;
  priceToBook:      number | null;
  trailingEps:      number | null;
  // Analyst consensus
  targetMeanPrice:  number | null;
  targetHighPrice:  number | null;
  targetLowPrice:   number | null;
  analystCount:     number | null;
  recommendation:   string | null;  // 'buy' | 'hold' | 'sell' | 'strongBuy' | 'strongSell'
  // Size
  marketCap:        number | null;
  // Dividend
  dividendYield:    number | null;
  // Links
  googleFinanceUrl: string;
  googleNewsUrl:    string;
  // Meta
  fetchedAt:        string;
  error?:           string;
}

// ─── Real session-open price via 1-minute chart ───────────────────────────────

/**
 * Fetches the accurate 09:15 IST opening price by requesting 1-minute interval
 * candles for today and reading the first candle that falls at/after 09:15 IST.
 *
 * Why 1m and not 1d?
 *  - The 1d candle open is populated lazily by Yahoo and often echoes prevClose
 *    until well into the morning session.
 *  - The 1m candle at 09:15 IST is the actual auction-cleared opening price.
 */
export async function fetchSessionOpen(yahooSymbol: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 60 } });
    if (!res.ok) return 0;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return 0;

    const timestamps: number[] = result.timestamp ?? [];
    const opens: number[]      = result.indicators?.quote?.[0]?.open ?? [];

    // NSE pre-open auction ends at 09:15 IST = 03:45 UTC
    // Find the first 1m candle at or after 03:45 UTC with a valid open
    const NSE_OPEN_UTC_MINS = 3 * 60 + 45; // 225

    for (let i = 0; i < timestamps.length; i++) {
      const d   = new Date(timestamps[i] * 1000);
      const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes();
      if (utcMins >= NSE_OPEN_UTC_MINS && opens[i] > 0) {
        return opens[i];
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─── Fundamental data via Yahoo quoteSummary ──────────────────────────────────

/**
 * Fetches rich fundamental data for one ticker using Yahoo Finance quoteSummary.
 * This supplements the v8 chart data (which only has price/volume).
 *
 * Modules used:
 *  - summaryDetail    → P/E, market cap, dividend yield
 *  - financialData    → analyst targets, recommendation, revenue growth
 *  - defaultKeyStatistics → EPS, P/B, beta
 */
export async function fetchFundamentals(
  yahooSymbol: string,
  ticker: string
): Promise<FundamentalData> {
  const base: FundamentalData = {
    ticker,
    symbol:          yahooSymbol,
    trailingPE:      null,
    forwardPE:       null,
    priceToBook:     null,
    trailingEps:     null,
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice:  null,
    analystCount:    null,
    recommendation:  null,
    marketCap:       null,
    dividendYield:   null,
    googleFinanceUrl: googleFinanceUrl(ticker),
    googleNewsUrl:    googleFinanceNewsUrl(ticker),
    fetchedAt:       new Date().toISOString(),
  };

  const modules = ['summaryDetail', 'financialData', 'defaultKeyStatistics'].join(',');
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=${modules}`;

  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return { ...base, error: 'No result' };

    const sd  = result.summaryDetail       ?? {};
    const fd  = result.financialData       ?? {};
    const dks = result.defaultKeyStatistics ?? {};

    const raw = (obj: any, key: string): number | null => {
      const v = obj[key]?.raw;
      return typeof v === 'number' ? v : null;
    };

    return {
      ...base,
      trailingPE:      raw(sd,  'trailingPE'),
      forwardPE:       raw(sd,  'forwardPE'),
      priceToBook:     raw(dks, 'priceToBook'),
      trailingEps:     raw(dks, 'trailingEps'),
      targetMeanPrice: raw(fd,  'targetMeanPrice'),
      targetHighPrice: raw(fd,  'targetHighPrice'),
      targetLowPrice:  raw(fd,  'targetLowPrice'),
      analystCount:    raw(fd,  'numberOfAnalystOpinions'),
      recommendation:  fd.recommendationKey ?? null,
      marketCap:       raw(sd,  'marketCap'),
      dividendYield:   raw(sd,  'dividendYield'),
    };
  } catch (e: any) {
    return { ...base, error: e.message };
  }
}

/**
 * Batch-fetches fundamentals for multiple tickers.
 * Runs in parallel with a concurrency cap to avoid rate-limiting.
 */
export async function fetchFundamentalsBatch(
  stocks: { yahooSymbol: string; ticker: string }[]
): Promise<FundamentalData[]> {
  // Fan out with max 5 concurrent requests
  const CONCURRENCY = 5;
  const results: FundamentalData[] = [];
  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const batch = stocks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(s => fetchFundamentals(s.yahooSymbol, s.ticker))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }
  return results;
}

// ─── Recommendation label ─────────────────────────────────────────────────────

export function recLabel(key: string | null): { text: string; color: string } {
  switch (key) {
    case 'strongBuy':  return { text: 'Strong Buy',  color: '#10b981' };
    case 'buy':        return { text: 'Buy',          color: '#34d399' };
    case 'hold':       return { text: 'Hold',         color: '#f59e0b' };
    case 'sell':       return { text: 'Sell',         color: '#f87171' };
    case 'strongSell': return { text: 'Strong Sell',  color: '#ef4444' };
    default:           return { text: 'N/A',          color: '#52525b' };
  }
}

/** Compact market cap display: ₹2.3L Cr, ₹45K Cr, etc. */
export function fmtMarketCap(v: number | null): string {
  if (!v || v <= 0) return '—';
  const cr = v / 1e7;  // INR to Crore (1 Cr = 1e7)
  if (cr >= 100_000) return `₹${(cr / 100_000).toFixed(1)}L Cr`;
  if (cr >= 1_000)   return `₹${(cr / 1_000).toFixed(1)}K Cr`;
  return `₹${cr.toFixed(0)} Cr`;
}
