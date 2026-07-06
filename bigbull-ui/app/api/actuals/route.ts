import { NextRequest, NextResponse } from 'next/server';
import { fetchAllNSEQuotes } from '@/lib/nseData';
import { getMarketStatus, todayIST } from '@/lib/marketUtils';
import { saveActuals, loadActuals, StoredActual } from '@/lib/store';

export async function GET(req: NextRequest) {
  const today      = todayIST();
  const dateParam  = req.nextUrl.searchParams.get('date') ?? today;
  const isPastDate = dateParam < today;

  // ── Past date: serve from stored file only ───────────────────────────────────
  if (isPastDate) {
    const stored = loadActuals(dateParam);
    if (!stored) {
      return NextResponse.json(
        { error: 'NO_DATA', message: `No stored actuals for ${dateParam}. Actuals are saved after 15:30 IST on trading days.`, date: dateParam },
        { status: 404 }
      );
    }
    return NextResponse.json(stored, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // ── Today: live fetch ────────────────────────────────────────────────────────
  const status = getMarketStatus();
  if (status.isWeekend) {
    return NextResponse.json(
      { error: 'MARKET_CLOSED_WEEKEND', message: 'NSE/BSE is closed on weekends.', session: status },
      { status: 503 }
    );
  }

  try {
    const quotes = await fetchAllNSEQuotes();

    const actuals: StoredActual[] = quotes
      .map(q => ({
        ticker:               q.ticker,
        daily_return_pct:     Math.round(q.regularMarketChangePercent * 100) / 100,
        closing_price:        q.regularMarketPrice,
        total_volume_cr:      Math.round((q.regularMarketVolume * q.regularMarketPrice) / 1e7) / 100,
        institutional_volume: Math.round((q.regularMarketVolume * q.regularMarketPrice) / 1e7) / 100,
        saved_at:             new Date().toISOString(),
      }))
      .sort((a, b) => b.daily_return_pct - a.daily_return_pct)
      .slice(0, 10)
      .map((item, idx) => ({ rank: idx + 1, ...item }));

    // Auto-save actuals if market is post-close (15:30+ IST)
    // This way actuals recorded at end of day reflect closing prices
    if (status.session === 'post' || status.session === 'closed') {
      saveActuals(today, actuals);
    }

    return NextResponse.json(actuals, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch (err: any) {
    console.error('Actuals fetch error:', err);
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 502 });
  }
}
