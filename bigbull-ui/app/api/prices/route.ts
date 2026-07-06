import { NextRequest, NextResponse } from 'next/server';
import { NSE_UNIVERSE } from '@/lib/nseData';

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

/**
 * GET /api/prices?tickers=ADANIPORTS,SBIN,POWERGRID
 *
 * Lightweight endpoint — fetches only current price + change% for the requested tickers.
 * No caching on the server (cache-control: no-store) so the browser always gets fresh data.
 * Uses Yahoo Finance v8/chart in parallel — fast enough for 10 tickers in ~300ms.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tickerParam = searchParams.get('tickers') ?? '';
  const requestedTickers = tickerParam.split(',').map(t => t.trim()).filter(Boolean);

  if (requestedTickers.length === 0) {
    return NextResponse.json({ error: 'Missing tickers param' }, { status: 400 });
  }

  // Map tickers → Yahoo symbols
  const stocks = NSE_UNIVERSE.filter(u => requestedTickers.includes(u.ticker));
  if (stocks.length === 0) {
    return NextResponse.json({ error: 'No valid tickers found' }, { status: 400 });
  }

  const results = await Promise.allSettled(
    stocks.map(async ({ symbol, ticker }) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
      const res = await fetch(url, { headers: YAHOO_HEADERS, cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) return null;

      const price     = meta.regularMarketPrice ?? 0;
      const prevClose = meta.chartPreviousClose  ?? price;
      const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      return {
        ticker,
        price:      Math.round(price * 100) / 100,
        change_pct: Math.round(changePct * 100) / 100,
        prev_close: Math.round(prevClose * 100) / 100,
        fetched_at: new Date().toISOString(),
      };
    })
  );

  const prices: Record<string, { price: number; change_pct: number; prev_close: number; fetched_at: string }> = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      prices[r.value.ticker] = {
        price:      r.value.price,
        change_pct: r.value.change_pct,
        prev_close: r.value.prev_close,
        fetched_at: r.value.fetched_at,
      };
    }
  }

  return NextResponse.json(prices, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
