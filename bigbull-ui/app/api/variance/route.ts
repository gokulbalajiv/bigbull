import { NextRequest, NextResponse } from 'next/server';
import { fetchAllNSEQuotes, deriveConvictionScore, deriveFlow } from '@/lib/nseData';
import { getMarketStatus, todayIST } from '@/lib/marketUtils';
import {
  loadProjections, loadActuals,
  appendVarianceLog, updateModifiers, loadModifiers,
} from '@/lib/store';

export async function GET(req: NextRequest) {
  const today     = todayIST();
  const dateParam = req.nextUrl.searchParams.get('date') ?? today;
  const status    = getMarketStatus();

  if (status.isWeekend) {
    return NextResponse.json(
      { error: 'MARKET_CLOSED_WEEKEND', message: 'NSE/BSE is closed on weekends.', session: status },
      { status: 503 }
    );
  }

  try {
    let projectedTickers: string[];
    let actualTickers:    string[];
    let actualReturns:    Record<string, number> = {};

    const isPastDate = dateParam < today;

    if (isPastDate) {
      // ── Past date: use stored data only ─────────────────────────────────────
      const storedProj = loadProjections(dateParam);
      const storedAct  = loadActuals(dateParam);

      if (!storedProj || !storedAct) {
        return NextResponse.json(
          { error: 'NO_DATA', message: `No stored data for ${dateParam}.`, date: dateParam },
          { status: 404 }
        );
      }

      projectedTickers = storedProj.map(p => p.ticker);
      actualTickers    = storedAct.map(a => a.ticker);
      for (const a of storedAct) actualReturns[a.ticker] = a.daily_return_pct;

    } else {
      // ── Today: live fetch ────────────────────────────────────────────────────
      const quotes = await fetchAllNSEQuotes();

      projectedTickers = quotes
        .map(q => ({ ticker: q.ticker, score: deriveConvictionScore(q) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(q => q.ticker);

      actualTickers = [...quotes]
        .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
        .slice(0, 10)
        .map(q => q.ticker);

      for (const q of quotes) actualReturns[q.ticker] = q.regularMarketChangePercent;
    }

    const projSet = new Set(projectedTickers);
    const hits    = actualTickers.filter(t =>  projSet.has(t));
    const misses  = actualTickers.filter(t => !projSet.has(t));
    const hitRate = hits.length / 10;

    // Learning adjustments derived from real variance
    const currentModifiers = loadModifiers();
    const getVal = (level: string, key: string) =>
      currentModifiers.find(m => m.level === level && m.modifier_key === key)?.current_value ?? 0;

    const learningAdjustments = [
      {
        engine_level: 'Level_1', modifier_key: 'CRUDE_DANGER_THRESHOLD',
        old_value: getVal('Level_1', 'CRUDE_DANGER_THRESHOLD'),
        new_value: parseFloat((getVal('Level_1', 'CRUDE_DANGER_THRESHOLD') * (1 + (hitRate - 0.5) * 0.05)).toFixed(2)),
      },
      {
        engine_level: 'Level_7', modifier_key: 'INSTITUTIONAL_ACCUMULATION_MIN_CR',
        old_value: getVal('Level_7', 'INSTITUTIONAL_ACCUMULATION_MIN_CR'),
        new_value: parseFloat((getVal('Level_7', 'INSTITUTIONAL_ACCUMULATION_MIN_CR') * (1 + (1 - hitRate) * 0.1)).toFixed(2)),
      },
      {
        engine_level: 'Level_10', modifier_key: 'LEARNING_RATE_ALPHA',
        old_value: getVal('Level_10', 'LEARNING_RATE_ALPHA'),
        new_value: parseFloat((getVal('Level_10', 'LEARNING_RATE_ALPHA') * (1 + (1 - hitRate) * 0.2)).toFixed(4)),
      },
    ].filter(a => a.old_value !== a.new_value);

    // Persist learning — append missed stocks to variance log + update modifiers
    if (misses.length > 0 && (!isPastDate || status.session === 'post' || status.session === 'closed')) {
      const auditTs = new Date().toISOString();
      appendVarianceLog(
        misses.map(ticker => ({
          date:                      dateParam,
          missed_ticker:             ticker,
          actual_return:             actualReturns[ticker] ?? 0,
          engine_failure_point:      'Level_7',
          failure_reason:            `Ticker appeared in actual top 10 but not in engine's projected top 10`,
          weight_adjustment_applied: learningAdjustments[0] ?? null,
          audit_run_ts:              auditTs,
        }))
      );
      if (learningAdjustments.length > 0) {
        updateModifiers(learningAdjustments);
      }
    }

    return NextResponse.json({
      date:                dateParam,
      delta_score_pct:     parseFloat((hitRate * 100).toFixed(1)),
      hits,
      misses,
      learning_adjustments: learningAdjustments,
      is_stored:           isPastDate,
    }, {
      headers: { 'Cache-Control': isPastDate ? 'public, max-age=86400' : 'public, max-age=300' },
    });

  } catch (err: any) {
    console.error('Variance fetch error:', err);
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 502 });
  }
}
