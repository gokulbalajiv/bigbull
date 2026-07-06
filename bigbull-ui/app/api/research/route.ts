import { NextRequest, NextResponse } from 'next/server';
import { fetchFundamentalsBatch } from '@/lib/googleFinance';
import { NSE_UNIVERSE } from '@/lib/nseData';

/**
 * GET /api/research
 *
 * Returns fundamental data (P/E, analyst targets, EPS, P/B, market cap,
 * dividend yield, analyst consensus) for the full NSE universe.
 *
 * Data source: Yahoo Finance quoteSummary (modules: summaryDetail,
 * financialData, defaultKeyStatistics).
 *
 * Google Finance deep-links for each ticker are included in the response so
 * the UI can open the Google Finance page for manual research.
 *
 * Cache: 1 hour (fundamentals don't change intraday).
 */
export async function GET(req: NextRequest) {
  const tickerParam = req.nextUrl.searchParams.get('tickers');

  // Build the stock list to fetch
  const universe = NSE_UNIVERSE.map(s => ({
    yahooSymbol: s.symbol,
    ticker:      s.ticker,
  }));

  const requested = tickerParam
    ? universe.filter(u => tickerParam.split(',').includes(u.ticker))
    : universe;

  try {
    const fundamentals = await fetchFundamentalsBatch(requested);

    return NextResponse.json(
      { tickers: fundamentals, fetched_at: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300' } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: err.message },
      { status: 502 }
    );
  }
}
