import { NextRequest, NextResponse } from 'next/server';
import { loadProjections, loadModifiers, availableProjectionDates } from '@/lib/store';
import { THESIS_MAP } from '@/lib/nseData';

const INVALIDATION: Record<string, string> = {
  RELIANCE:    'Jio ARPU falls below ₹180 or retail segment losses widen beyond ₹2000Cr quarterly.',
  HDFCBANK:    'CD ratio breaches 115% or gross slippages exceed 2.5% in consecutive quarters.',
  INFY:        'Large deal TCV falls below $3B for two consecutive quarters or attrition spikes above 22%.',
  TCS:         'BFSI revenue decline exceeds 3% QoQ or GenAI projects face client budget freezes.',
  ICICIBANK:   'GNPA inches above 2% or RBI penalty action on retail credit practices.',
  HINDUNILVR:  'Rural demand reversal due to monsoon failure or crude-linked packaging cost surge above 15%.',
  SBIN:        'Corporate NPA cycle reversal with slippages above 1.8% or CASA ratio falls below 42%.',
  BHARTIARTL:  'Africa EBITDA margin compression below 40% or domestic tariff war restarts.',
  ITC:         'Cigarette volume decline exceeds 4% due to state tax hikes or FMCG losses widen.',
  KOTAKBANK:   'NIM compression below 4.5% or founder succession uncertainty creates leadership vacuum.',
  LT:          'Order inflows miss guidance by >15% for two consecutive quarters.',
  AXISBANK:    'GNPA inches above 2% or RBI penalty action on credit card practices.',
  BAJFINANCE:  'Stage-2 assets breach 8% of AUM or RBI tightening on personal loans impacts NII.',
  MARUTI:      'Market share loss below 40% to new EV entrants or input cost inflation exceeds 5%.',
  TITAN:       'Jewellery revenue growth dips below 12% on gold price correction or competitive entry.',
  WIPRO:       'European client budget cuts reduce deal sizes below $50M average.',
  SUNPHARMA:   'US FDA import alert on key facilities or specialty product pricing erosion exceeds 12%.',
  TATAMOTORS:  'JLR EV ramp delays beyond Q2FY27 or India PV market share drops below 12%.',
  NTPC:        'Renewable energy capex cost overruns above 20% or grid evacuation bottlenecks.',
  POWERGRID:   'Regulated equity base growth falls below 8% due to TBCB project delays.',
  ONGC:        'Crude falls below $65/bbl sustained for 60 days or domestic gas price revision reversed.',
  TATASTEEL:   'Iron ore prices spike above $140/MT or UK operations EBITDA loss exceeds ₹1500Cr/quarter.',
  ADANIPORTS:  'Regulatory action on Adani Group entities or container volume growth dips below 8% YoY.',
  ULTRACEMCO:  'Cement realisation per tonne falls below ₹350 on regional pricing war.',
  BAJAJFINSV:  'Insurance combined ratio deteriorates above 110% or Bajaj Finance GNPA spikes.',
  NESTLEIND:   'Rural demand collapse reduces volume growth below 4% for two quarters.',
  HCLTECH:     'Engineering services deal wins miss $1B quarterly TCV or utilisation falls below 81%.',
  TECHM:       'Telecom client IT budgets freeze or EBIT margin stagnates below 10% for two quarters.',
  DRREDDY:     'US FDA import alert or complex generics pricing erosion exceeds 15% annually.',
  CIPLA:       'US FDA approval delays for peptide pipeline beyond 18 months or domestic pricing controls tighten.',
};

/**
 * GET /api/thesis?ticker=RELIANCE
 *
 * Derives thesis entries from real stored projection data.
 * Falls back to a synthetic entry for tickers never yet stored.
 */
export async function GET(req: NextRequest) {
  const tickerFilter = req.nextUrl.searchParams.get('ticker')?.toUpperCase();
  const dates        = availableProjectionDates();

  // Collect all unique tickers seen in stored projections, with their most recent entry date
  const tickerLatestDate: Record<string, { date: string; flow: string; score: number }> = {};

  for (const date of dates) {
    const proj = loadProjections(date);
    if (!proj) continue;
    for (const p of proj) {
      if (!tickerLatestDate[p.ticker] || date > tickerLatestDate[p.ticker].date) {
        tickerLatestDate[p.ticker] = { date, flow: p.level7_flow, score: p.conviction_score };
      }
    }
  }

  // Determine status from flow of the most recent appearance
  function flowToStatus(flow: string): 'Strengthened' | 'Neutral' | 'Broken' {
    if (flow === 'Accumulation') return 'Strengthened';
    if (flow === 'Distribution') return 'Broken';
    return 'Neutral';
  }

  let entries = Object.entries(tickerLatestDate).map(([ticker, meta], idx) => ({
    thesis_id:            `thesis-${ticker.toLowerCase()}-${meta.date}`,
    ticker,
    entry_date:           meta.date,
    core_milestone:       THESIS_MAP[ticker] ?? 'Strong fundamental case with positive sector tailwinds.',
    invalidation_trigger: INVALIDATION[ticker] ?? 'Material deterioration in business fundamentals.',
    status:               flowToStatus(meta.flow),
    conviction_score:     meta.score,
  }));

  if (tickerFilter) {
    entries = entries.filter(e => e.ticker === tickerFilter);
  }

  // Sort: Strengthened first, then Neutral, then Broken
  const ORDER: Record<string, number> = { Strengthened: 0, Neutral: 1, Broken: 2 };
  entries.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'NO_DATA', message: tickerFilter
        ? `No thesis data stored for ${tickerFilter} yet.`
        : 'No thesis data stored yet. Thesis is derived from real stored projections.' },
      { status: 404 }
    );
  }

  return NextResponse.json(entries, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
