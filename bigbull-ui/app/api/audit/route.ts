import { NextRequest, NextResponse } from 'next/server';
import { getMarketStatus, todayIST } from '@/lib/marketUtils';
import {
  loadProjections, loadActuals, saveActuals, loadVarianceLog,
  appendVarianceLog, updateModifiers, loadModifiers,
  availableProjectionDates, StoredActual, updateProjections,
} from '@/lib/store';
import { fetchActualMovers, deriveConvictionScore, fetchAllNSEQuotes } from '@/lib/nseData';

/**
 * GET /api/audit?date=YYYY-MM-DD
 *
 * Consolidated audit endpoint.
 *
 * Auto-saves actuals for today when:
 *   - It IS today's date
 *   - Market is post-close OR closed (â‰¥ 15:30 IST)
 *   - Actuals file doesn't exist yet
 *
 * For past dates: serves stored data only. Never generates or mocks.
 */
export async function GET(req: NextRequest) {
  const today = todayIST();
  const dateParam = req.nextUrl.searchParams.get('date') ?? today;
  const status = getMarketStatus();
  const isToday = dateParam === today;
  // Only fetch actuals after market has closed (session = 'post' | 'closed' | 'pre' next day)
  const isPostClose = status.session === 'post' || status.session === 'closed';

  // ── Auto-save actuals for today if market has closed and file is missing ──
  let actualsJustSaved = false;
  if (isToday && isPostClose && !loadActuals(today)) {
    try {
      const movers = await fetchActualMovers(10);
      const actuals: StoredActual[] = movers.map((m, idx) => ({
        rank: idx + 1,
        ticker: m.ticker,
        daily_return_pct: m.daily_return_pct,
        closing_price: m.closing_price,
        total_volume_cr: m.volume_cr,
        institutional_volume: m.volume_cr,
        saved_at: new Date().toISOString(),
      }));

      saveActuals(today, actuals);
      actualsJustSaved = true;
    } catch (err) {
      console.error('Auto-save actuals failed:', err);
    }
  }

  // ── Enrich projections with actual intraday high/low + target/stop hit flags ──
  // Runs when:
  //   (a) actuals were just saved for the first time today, OR
  //   (b) actuals already exist but the stored projections are missing enrichment
  //       (handles server restarts, page refreshes after initial save)
  const needsEnrichment = (() => {
    if (!isToday) return false;
    const existingProjected = loadProjections(today);
    const existingActuals = loadActuals(today);
    if (!existingProjected || !existingActuals) return false;
    // Need enrichment if any projection row is missing actual_high
    return existingProjected.some(p => (p as any).actual_high === undefined);
  })();

  if (actualsJustSaved || needsEnrichment) {
    try {
      const projected = loadProjections(today);
      const actuals = loadActuals(today);
      if (projected && projected.length > 0 && actuals && actuals.length > 0) {
        // Fetch live quotes to get today's Day High / Day Low
        const quotes = await fetchAllNSEQuotes();
        const quotesMap = Object.fromEntries(quotes.map(q => [q.ticker, q]));

        let targetHits = 0;
        let stopHits = 0;

        const updatedProjected = projected.map(p => {
          const q = quotesMap[p.ticker];
          if (!q) return p;

          const actualHigh = q.regularMarketDayHigh;
          const actualLow = q.regularMarketDayLow;
          const targetHit = actualHigh >= p.projected_price;
          const stopHit = actualLow <= p.stop_loss;

          if (targetHit) targetHits++;
          if (stopHit) stopHits++;

          return { ...p, actual_high: actualHigh, actual_low: actualLow, target_hit: targetHit, stop_hit: stopHit };
        });

        updateProjections(today, updatedProjected);

        if (actualsJustSaved) {
          const projSet = new Set(projected.map(p => p.ticker));
          const actTickers = actuals.map(a => a.ticker);
          const hits = actTickers.filter(t => projSet.has(t));
          const misses = actTickers.filter(t => !projSet.has(t));
          const hitRate = hits.length / 10;

          if (misses.length > 0) {
            const mods = loadModifiers();
            const getVal = (level: string, key: string) =>
              mods.find(m => m.level === level && m.modifier_key === key)?.current_value ?? 0;

            const successRate = projected.length > 0 ? targetHits / projected.length : 0.5;
            const themeAdjust = successRate < 0.5 ? 1.02 : 0.98;
            const instAdjust = successRate < 0.5 ? 1.05 : 0.95;

            const adjustments = [
              { engine_level: 'Level_1', modifier_key: 'CRUDE_DANGER_THRESHOLD', old_value: getVal('Level_1', 'CRUDE_DANGER_THRESHOLD'), new_value: parseFloat((getVal('Level_1', 'CRUDE_DANGER_THRESHOLD') * (1 + (hitRate - 0.5) * 0.05)).toFixed(2)) },
              { engine_level: 'Level_7', modifier_key: 'INSTITUTIONAL_ACCUMULATION_MIN_CR', old_value: getVal('Level_7', 'INSTITUTIONAL_ACCUMULATION_MIN_CR'), new_value: parseFloat((getVal('Level_7', 'INSTITUTIONAL_ACCUMULATION_MIN_CR') * instAdjust).toFixed(2)) },
              { engine_level: 'Level_10', modifier_key: 'LEARNING_RATE_ALPHA', old_value: getVal('Level_10', 'LEARNING_RATE_ALPHA'), new_value: parseFloat((getVal('Level_10', 'LEARNING_RATE_ALPHA') * (1 + (1 - hitRate) * 0.2)).toFixed(4)) },
              { engine_level: 'Level_2', modifier_key: 'MIN_THEME_SCORE', old_value: getVal('Level_2', 'MIN_THEME_SCORE'), new_value: parseFloat((getVal('Level_2', 'MIN_THEME_SCORE') * themeAdjust).toFixed(2)) },
            ].filter(a => a.old_value !== a.new_value);

            const auditTs = new Date().toISOString();
            appendVarianceLog(
              misses.map(ticker => {
                const actualEntry = actuals.find(a => a.ticker === ticker);
                return {
                  date: today,
                  missed_ticker: ticker,
                  actual_return: actualEntry?.daily_return_pct ?? 0,
                  engine_failure_point: 'Level_7',
                  failure_reason: `${ticker} was in actual top 10 by return but not in projected top 10`,
                  weight_adjustment_applied: adjustments[0] ?? null,
                  audit_run_ts: auditTs,
                };
              })
            );

            if (adjustments.length > 0) updateModifiers(adjustments);
          }
        }
      }
    } catch (err) {
      console.error('Enrichment/auto-save failed:', err);
    }
  }

  // ── Read from store ──────────────────────────────────────────────────────────
  const projected = loadProjections(dateParam);
  const actuals = loadActuals(dateParam);
  const variance = loadVarianceLog(dateParam);
  const modifiers = loadModifiers();
  const available = availableProjectionDates();

  const hasProjected = projected !== null && projected.length > 0;
  const hasActuals = actuals !== null && actuals.length > 0;
  const hasData = hasProjected;

  let hits: string[] = [], misses: string[] = [], hitRate = 0;
  if (hasProjected && hasActuals) {
    const projSet = new Set(projected!.map(p => p.ticker));
    const actTickers = actuals!.map(a => a.ticker);
    hits = actTickers.filter(t => projSet.has(t));
    misses = actTickers.filter(t => !projSet.has(t));
    hitRate = hits.length / 10;
  }

  return NextResponse.json({
    date: dateParam,
    is_today: isToday,
    has_data: hasData,
    has_actuals: hasActuals,
    actuals_just_saved: actualsJustSaved,
    market_status: status,
    available_dates: available,

    projected: projected ?? [],
    actuals: actuals ?? [],

    variance: {
      delta_score_pct: parseFloat((hitRate * 100).toFixed(1)),
      hits,
      misses,
      log_entries: variance,
    },

    learning: { modifiers },
  }, {
    headers: {
      // No cache once actuals are in â€” the next call needs fresh data
      'Cache-Control': 'no-store',
    },
  });
}

