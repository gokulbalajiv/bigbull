import { NextRequest, NextResponse } from 'next/server';
import { fetchAllNSEQuotes, deriveConvictionScore, deriveFlow, THEMATIC_ALPHA, THESIS_MAP } from '@/lib/nseData';
import { getMarketStatus, todayIST } from '@/lib/marketUtils';
import { saveProjections, loadProjections, pruneOldData, StoredProjection } from '@/lib/store';

const FLOW_PRIORITY: Record<string, number> = {
  Accumulation: 0,
  Neutral:      1,
  Distribution: 2,
};

function deriveIntradayLevels(
  price: number,
  convictionScore: number,
  flow: 'Accumulation' | 'Neutral' | 'Distribution',
  changePct: number
): { projected_price: number; stop_loss: number; upside_pct: number; risk_pct: number } {
  const clampedScore = Math.min(Math.max(convictionScore, 45), 85);
  let upsidePct = 0.30 + ((clampedScore - 45) / (85 - 45)) * (1.50 - 0.30);
  if (flow === 'Accumulation') upsidePct += 0.15;
  if (flow === 'Distribution') upsidePct -= 0.15;
  if (changePct > 0) upsidePct += Math.min(changePct / 0.5 * 0.05, 0.30);
  upsidePct = Math.max(0.20, Math.min(upsidePct, 2.0));
  const riskPct = Math.max(upsidePct / 2, 0.15);
  return {
    projected_price: Math.round(price * (1 + upsidePct / 100) * 20) / 20,
    stop_loss:       Math.round(price * (1 - riskPct  / 100) * 20) / 20,
    upside_pct: Math.round(upsidePct * 100) / 100,
    risk_pct:   Math.round(riskPct   * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const today      = todayIST();
  const dateParam  = req.nextUrl.searchParams.get('date') ?? today;
  const isPastDate = dateParam < today;

  // ── Past date: serve from stored file only ────────────────────────────────────
  if (isPastDate) {
    const stored = loadProjections(dateParam);
    if (!stored) {
      return NextResponse.json(
        { error: 'NO_DATA', message: `No stored projections for ${dateParam}.`, date: dateParam },
        { status: 404 }
      );
    }
    return NextResponse.json(stored, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // ── Freeze rule: once session is open / post / closed, predictions are LOCKED ─
  // The snapshot is taken on the FIRST call after 09:15 IST and never changed again.
  // This prevents the Top 10 list, Target, and Stop from drifting during the session.
  const status  = getMarketStatus();
  const session = status.session;

  const existingToday = loadProjections(today);
  const sessionIsLocked = session === 'open' || session === 'post' || session === 'closed';

  if (existingToday && sessionIsLocked) {
    // Snapshot is frozen — return it as-is for the rest of the day
    return NextResponse.json(existingToday, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  }

  // ── Weekend guard ─────────────────────────────────────────────────────────────
  if (status.isWeekend) {
    return NextResponse.json(
      { error: 'MARKET_CLOSED_WEEKEND', message: 'NSE/BSE is closed on weekends.', session: status },
      { status: 503 }
    );
  }

  // ── Live fetch (only runs pre-open or when no snapshot exists yet) ────────────
  try {
    const quotes = await fetchAllNSEQuotes();

    const totalScore = quotes.reduce((acc, q) => acc + deriveConvictionScore(q), 0);
    const scored: StoredProjection[] = quotes
      .map(q => {
        const conviction_score = deriveConvictionScore(q);
        const level7_flow      = deriveFlow(q);
        const prevClose        = q.regularMarketPreviousClose;
        const currentPrice     = q.regularMarketPrice;

        // ── Open price resolution ─────────────────────────────────────────────
        // Valid open: > 0, differs from prevClose by 0.01–20%
        const rawOpen     = q.regularMarketOpen ?? 0;
        const openDiffPct = prevClose > 0 ? Math.abs((rawOpen - prevClose) / prevClose) * 100 : 0;
        const openIsValid =
          rawOpen > 0 &&
          openDiffPct >= 0.01 &&
          openDiffPct <= 20;

        // If open is not confirmed (flat open or pre-market), use currentPrice as
        // the best available anchor. This is what the snapshot will be frozen with
        // once 09:15 hits.
        const open_confirmed  = openIsValid;
        const day_start_price = openIsValid ? rawOpen : (currentPrice > 0 ? currentPrice : prevClose);

        // Target / Stop anchored to the frozen day_start_price
        const basePrice = day_start_price;

        const { projected_price: rawTarget, stop_loss, upside_pct, risk_pct } =
          deriveIntradayLevels(basePrice, conviction_score, level7_flow, q.regularMarketChangePercent);

        // Hard guard: Target must always be > current price
        let projected_price = rawTarget;
        if (projected_price <= currentPrice) {
          const { projected_price: floored } = deriveIntradayLevels(
            currentPrice, conviction_score, level7_flow, q.regularMarketChangePercent
          );
          projected_price = floored;
        }

        const hrp_weight = conviction_score / totalScore;
        return {
          rank:                0, // assigned below after sort + slice
          ticker: q.ticker, sector: q.sector, conviction_score,
          conviction_prob:     Math.min(0.99, conviction_score / 100 + 0.1),
          thematic_alpha:      THEMATIC_ALPHA[q.ticker] ?? 'Market_Momentum',
          thesis_summary:      THESIS_MAP[q.ticker]     ?? 'Strong fundamental case with positive sector tailwinds.',
          level7_flow,
          hrp_weight,
          weight_pct:          Math.round(hrp_weight * 10000) / 100,
          top_bullish_driver:  'x2_thematic_momentum',
          top_bearish_drag:    'x5_expectations_gap_pct',
          day_start_price,
          open_confirmed,
          current_price:       currentPrice,
          change_pct:          Math.round(q.regularMarketChangePercent * 100) / 100,
          projected_price, stop_loss, upside_pct, risk_pct,
          saved_at:            new Date().toISOString(),
        } as StoredProjection;
      })
      .sort((a, b) => {
        const fp = FLOW_PRIORITY[a.level7_flow] - FLOW_PRIORITY[b.level7_flow];
        return fp !== 0 ? fp : b.conviction_score - a.conviction_score;
      })
      .slice(0, 10)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    // Save snapshot. If session is already 'open' this is the freeze point —
    // saveProjections will lock it and never overwrite again.
    saveProjections(today, scored);
    pruneOldData();

    // No-store only during pre-open; once open the frozen snapshot is served
    const cacheHeader = sessionIsLocked
      ? 'public, max-age=300, stale-while-revalidate=60'
      : 'no-store';

    return NextResponse.json(scored, {
      headers: { 'Cache-Control': cacheHeader },
    });
  } catch (err: any) {
    console.error('Projections fetch error:', err);
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 502 });
  }
}

