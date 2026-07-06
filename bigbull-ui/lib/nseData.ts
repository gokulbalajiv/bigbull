/**
 * Real NSE data fetcher using Yahoo Finance v8 chart API
 * No API key required — uses the v8/finance/chart endpoint (publicly accessible).
 * The older v7/finance/quote endpoint now returns 401 Unauthorized.
 */

import { fetchSessionOpen } from '@/lib/googleFinance';

export interface NSEQuote {
  ticker: string;           // e.g. RELIANCE
  symbol: string;           // e.g. RELIANCE.NS
  shortName: string;
  sector: string;
  regularMarketPrice: number;
  regularMarketOpen: number;           // Today's session open price
  regularMarketPreviousClose: number;
  regularMarketChangePercent: number;  // % change today
  regularMarketVolume: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  averageDailyVolume3Month: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
}

// NSE Large & Mid-cap universe — covers Nifty 50 + key mid-caps incl. ₹100–₹500 price band
export const NSE_UNIVERSE_BASE: { symbol: string; ticker: string; sector: string }[] = [
  // ── Large-caps (Nifty 50 core) ───────────────────────────────────────────────
  { symbol: 'RELIANCE.NS',    ticker: 'RELIANCE',    sector: 'Energy & Petrochemicals' },
  { symbol: 'HDFCBANK.NS',    ticker: 'HDFCBANK',    sector: 'Banking & Finance' },
  { symbol: 'INFY.NS',        ticker: 'INFY',         sector: 'Information Technology' },
  { symbol: 'TCS.NS',         ticker: 'TCS',          sector: 'Information Technology' },
  { symbol: 'ICICIBANK.NS',   ticker: 'ICICIBANK',   sector: 'Banking & Finance' },
  { symbol: 'HINDUNILVR.NS',  ticker: 'HINDUNILVR',  sector: 'FMCG' },
  { symbol: 'SBIN.NS',        ticker: 'SBIN',         sector: 'Banking & Finance' },
  { symbol: 'BHARTIARTL.NS',  ticker: 'BHARTIARTL',  sector: 'Telecom' },
  { symbol: 'ITC.NS',         ticker: 'ITC',          sector: 'FMCG' },
  { symbol: 'KOTAKBANK.NS',   ticker: 'KOTAKBANK',   sector: 'Banking & Finance' },
  { symbol: 'LT.NS',          ticker: 'LT',           sector: 'Capital Goods & Infra' },
  { symbol: 'AXISBANK.NS',    ticker: 'AXISBANK',    sector: 'Banking & Finance' },
  { symbol: 'BAJFINANCE.NS',  ticker: 'BAJFINANCE',  sector: 'NBFC' },
  { symbol: 'MARUTI.NS',      ticker: 'MARUTI',      sector: 'Automobiles' },
  { symbol: 'TITAN.NS',       ticker: 'TITAN',        sector: 'Consumer Discretionary' },
  { symbol: 'WIPRO.NS',       ticker: 'WIPRO',        sector: 'Information Technology' },
  { symbol: 'SUNPHARMA.NS',   ticker: 'SUNPHARMA',   sector: 'Pharmaceuticals' },
  { symbol: 'TATAMOTORS.NS',  ticker: 'TATAMOTORS',  sector: 'Automobiles' },
  { symbol: 'NTPC.NS',        ticker: 'NTPC',         sector: 'Power & Utilities' },
  { symbol: 'POWERGRID.NS',   ticker: 'POWERGRID',   sector: 'Power & Utilities' },
  { symbol: 'ONGC.NS',        ticker: 'ONGC',         sector: 'Oil & Gas' },
  { symbol: 'TATASTEEL.NS',   ticker: 'TATASTEEL',   sector: 'Metals & Mining' },
  { symbol: 'ADANIPORTS.NS',  ticker: 'ADANIPORTS',  sector: 'Infrastructure & Logistics' },
  { symbol: 'ULTRACEMCO.NS',  ticker: 'ULTRACEMCO',  sector: 'Cement & Building Materials' },
  { symbol: 'BAJAJFINSV.NS',  ticker: 'BAJAJFINSV',  sector: 'NBFC' },
  { symbol: 'NESTLEIND.NS',   ticker: 'NESTLEIND',   sector: 'FMCG' },
  { symbol: 'HCLTECH.NS',     ticker: 'HCLTECH',     sector: 'Information Technology' },
  { symbol: 'TECHM.NS',       ticker: 'TECHM',        sector: 'Information Technology' },
  { symbol: 'DRREDDY.NS',     ticker: 'DRREDDY',     sector: 'Pharmaceuticals' },
  { symbol: 'CIPLA.NS',       ticker: 'CIPLA',        sector: 'Pharmaceuticals' },

  // ── Mid-caps: ₹100–₹500 price band ─────────────────────────────────────────
  // PSU Banks
  { symbol: 'PNB.NS',         ticker: 'PNB',          sector: 'PSU Banking' },
  { symbol: 'CANBK.NS',       ticker: 'CANBK',        sector: 'PSU Banking' },
  { symbol: 'BANKBARODA.NS',  ticker: 'BANKBARODA',  sector: 'PSU Banking' },
  { symbol: 'UNIONBANK.NS',   ticker: 'UNIONBANK',   sector: 'PSU Banking' },
  { symbol: 'INDIANB.NS',     ticker: 'INDIANB',     sector: 'PSU Banking' },
  // PSU Energy & Oil
  { symbol: 'IOC.NS',         ticker: 'IOC',          sector: 'Oil & Gas' },
  { symbol: 'BPCL.NS',        ticker: 'BPCL',         sector: 'Oil & Gas' },
  { symbol: 'GAIL.NS',        ticker: 'GAIL',         sector: 'Oil & Gas' },
  { symbol: 'NMDC.NS',        ticker: 'NMDC',         sector: 'Metals & Mining' },
  { symbol: 'COALINDIA.NS',   ticker: 'COALINDIA',   sector: 'Metals & Mining' },
  { symbol: 'SAIL.NS',        ticker: 'SAIL',         sector: 'Metals & Mining' },
  // Power & Infra Finance
  { symbol: 'NHPC.NS',        ticker: 'NHPC',         sector: 'Power & Utilities' },
  { symbol: 'SJVN.NS',        ticker: 'SJVN',         sector: 'Power & Utilities' },
  { symbol: 'RECLTD.NS',      ticker: 'RECLTD',       sector: 'NBFC' },
  { symbol: 'PFC.NS',         ticker: 'PFC',          sector: 'NBFC' },
  { symbol: 'IRFC.NS',        ticker: 'IRFC',         sector: 'NBFC' },
  { symbol: 'HUDCO.NS',       ticker: 'HUDCO',        sector: 'NBFC' },
  // Capital Goods / Defence / Infra
  { symbol: 'BHEL.NS',        ticker: 'BHEL',         sector: 'Capital Goods & Infra' },
  { symbol: 'RVNL.NS',        ticker: 'RVNL',         sector: 'Capital Goods & Infra' },
  { symbol: 'IREDA.NS',       ticker: 'IREDA',        sector: 'NBFC' },
  // Tata Power
  { symbol: 'TATAPOWER.NS',   ticker: 'TATAPOWER',   sector: 'Power & Utilities' },
  // Digital / New-age
  { symbol: 'ZOMATO.NS',      ticker: 'ZOMATO',       sector: 'Consumer Internet' },
  { symbol: 'NYKAA.NS',       ticker: 'NYKAA',        sector: 'Consumer Internet' },
];

// Nifty Next 50 additions
const NIFTY_NEXT_50_ADDITIONS: { symbol: string; ticker: string; sector: string }[] = [
  { symbol: 'ADANIENT.NS',    ticker: 'ADANIENT',    sector: 'Diversified Conglomerate' },
  { symbol: 'ADANIGREEN.NS',  ticker: 'ADANIGREEN',  sector: 'Power & Utilities' },
  { symbol: 'AMBUJACEM.NS',   ticker: 'AMBUJACEM',   sector: 'Cement & Building Materials' },
  { symbol: 'APOLLOHOSP.NS',  ticker: 'APOLLOHOSP',  sector: 'Healthcare' },
  { symbol: 'BAJAJ-AUTO.NS',  ticker: 'BAJAJAUTO',   sector: 'Automobiles' },
  { symbol: 'BEL.NS',         ticker: 'BEL',          sector: 'Capital Goods & Infra' },
  { symbol: 'BERGEPAINT.NS',  ticker: 'BERGEPAINT',  sector: 'Consumer Discretionary' },
  { symbol: 'BRITANNIA.NS',   ticker: 'BRITANNIA',   sector: 'FMCG' },
  { symbol: 'CHOLAFIN.NS',    ticker: 'CHOLAFIN',    sector: 'NBFC' },
  { symbol: 'COLPAL.NS',      ticker: 'COLPAL',       sector: 'FMCG' },
  { symbol: 'DLF.NS',         ticker: 'DLF',          sector: 'Real Estate' },
  { symbol: 'DIVISLAB.NS',    ticker: 'DIVISLAB',    sector: 'Pharmaceuticals' },
  { symbol: 'EICHERMOT.NS',   ticker: 'EICHERMOT',   sector: 'Automobiles' },
  { symbol: 'GODREJCP.NS',    ticker: 'GODREJCP',    sector: 'FMCG' },
  { symbol: 'GRASIM.NS',      ticker: 'GRASIM',       sector: 'Cement & Building Materials' },
  { symbol: 'HAL.NS',         ticker: 'HAL',          sector: 'Capital Goods & Infra' },
  { symbol: 'HDFCAMC.NS',     ticker: 'HDFCAMC',     sector: 'Banking & Finance' },
  { symbol: 'HDFCLIFE.NS',    ticker: 'HDFCLIFE',    sector: 'Insurance' },
  { symbol: 'HEROMOTOCO.NS',  ticker: 'HEROMOTOCO',  sector: 'Automobiles' },
  { symbol: 'HINDALCO.NS',    ticker: 'HINDALCO',    sector: 'Metals & Mining' },
  { symbol: 'HINDPETRO.NS',   ticker: 'HINDPETRO',   sector: 'Oil & Gas' },
  { symbol: 'ICICIPRULI.NS',  ticker: 'ICICIPRULI',  sector: 'Insurance' },
  { symbol: 'ICICIGI.NS',     ticker: 'ICICIGI',     sector: 'Insurance' },
  { symbol: 'INDHOTEL.NS',    ticker: 'INDHOTEL',    sector: 'Consumer Discretionary' },
  { symbol: 'JINDALSTEL.NS',  ticker: 'JINDALSTEL',  sector: 'Metals & Mining' },
  { symbol: 'JSWSTEEL.NS',    ticker: 'JSWSTEEL',    sector: 'Metals & Mining' },
  { symbol: 'LUPIN.NS',       ticker: 'LUPIN',        sector: 'Pharmaceuticals' },
  { symbol: 'M%26M.NS',       ticker: 'MM',           sector: 'Automobiles' },
  { symbol: 'MCDOWELL-N.NS',  ticker: 'MCDOWELL',    sector: 'Consumer Discretionary' },
  { symbol: 'MOTHERSON.NS',   ticker: 'MOTHERSON',   sector: 'Automobiles' },
  { symbol: 'NAUKRI.NS',      ticker: 'NAUKRI',       sector: 'Consumer Internet' },
  { symbol: 'OFSS.NS',        ticker: 'OFSS',         sector: 'Information Technology' },
  { symbol: 'OIL.NS',         ticker: 'OIL',          sector: 'Oil & Gas' },
  { symbol: 'PIIND.NS',       ticker: 'PIIND',        sector: 'Chemicals' },
  { symbol: 'SHRIRAMFIN.NS',  ticker: 'SHRIRAMFIN',  sector: 'NBFC' },
  { symbol: 'SIEMENS.NS',     ticker: 'SIEMENS',     sector: 'Capital Goods & Infra' },
  { symbol: 'SRF.NS',         ticker: 'SRF',          sector: 'Chemicals' },
  { symbol: 'SUNTV.NS',       ticker: 'SUNTV',        sector: 'Media' },
  { symbol: 'TATACOMM.NS',    ticker: 'TATACOMM',    sector: 'Telecom' },
  { symbol: 'TATACHEM.NS',    ticker: 'TATACHEM',    sector: 'Chemicals' },
  { symbol: 'TATACONSUM.NS',  ticker: 'TATACONSUM',  sector: 'FMCG' },
  { symbol: 'TVSMOTOR.NS',    ticker: 'TVSMOTOR',    sector: 'Automobiles' },
  { symbol: 'VEDL.NS',        ticker: 'VEDL',         sector: 'Metals & Mining' },
  { symbol: 'VOLTAS.NS',      ticker: 'VOLTAS',       sector: 'Consumer Discretionary' },
  { symbol: 'ZYDUSLIFE.NS',   ticker: 'ZYDUSLIFE',   sector: 'Pharmaceuticals' },
  { symbol: 'PAYTM.NS',       ticker: 'PAYTM',        sector: 'Consumer Internet' },
  { symbol: 'ABB.NS',         ticker: 'ABB',          sector: 'Capital Goods & Infra' },
  { symbol: 'ATGL.NS',        ticker: 'ATGL',         sector: 'Oil & Gas' },
  { symbol: 'CGPOWER.NS',     ticker: 'CGPOWER',      sector: 'Capital Goods & Infra' },
  { symbol: 'CUMMINSIND.NS',  ticker: 'CUMMINSIND',  sector: 'Capital Goods & Infra' },
  { symbol: 'DMART.NS',       ticker: 'DMART',        sector: 'Consumer Discretionary' },
  { symbol: 'LODHA.NS',       ticker: 'LODHA',        sector: 'Real Estate' },
  { symbol: 'MARICO.NS',      ticker: 'MARICO',       sector: 'FMCG' },
  { symbol: 'PERSISTENT.NS',  ticker: 'PERSISTENT',  sector: 'Information Technology' },
  { symbol: 'POLICYBZR.NS',   ticker: 'POLICYBZR',   sector: 'Insurance' },
  { symbol: 'TRENT.NS',       ticker: 'TRENT',        sector: 'Consumer Discretionary' },
  { symbol: 'UNITDSPR.NS',    ticker: 'UNITDSPR',    sector: 'Consumer Discretionary' },
  { symbol: 'VBL.NS',         ticker: 'VBL',          sector: 'FMCG' },
  { symbol: 'WHIRLPOOL.NS',   ticker: 'WHIRLPOOL',   sector: 'Consumer Discretionary' },
];

export const NSE_UNIVERSE: { symbol: string; ticker: string; sector: string }[] = [
  ...NSE_UNIVERSE_BASE,
  ...NIFTY_NEXT_50_ADDITIONS,
];

export const NSE_ACTUALS_UNIVERSE = NSE_UNIVERSE;

const SECTOR_MAP = Object.fromEntries(NSE_UNIVERSE.map(u => [u.ticker, u.sector]));
const SHORTNAME_MAP = Object.fromEntries(NSE_UNIVERSE.map(u => [u.ticker, u.ticker]));

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

/**
 * Fetch a single NSE quote using the v8 chart API.
 * Returns null on failure (so the caller can skip/filter).
 */
async function fetchSingleQuote(
  symbol: string,
  ticker: string,
  sector: string
): Promise<NSEQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

  try {
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      // Next.js cache: revalidate every 5 minutes
      next: { revalidate: 300 },
    });

    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta   = result?.meta;
    if (!meta) return null;

    const prevClose: number = meta.chartPreviousClose ?? meta.regularMarketPrice ?? 0;
    const price: number     = meta.regularMarketPrice ?? 0;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    // ── Open price: 1-minute chart (most reliable) → indicators → meta fallback ──
    // The 1m candle at 09:15 IST is the true NSE auction-cleared opening price.
    // Yahoo's 1d open often echoes prevClose for 30+ minutes after session start.
    const oneMinOpen: number  = await fetchSessionOpen(symbol);
    const indicatorOpen: number = result?.indicators?.quote?.[0]?.open?.[0] ?? 0;
    const metaOpen: number    = meta.regularMarketOpen ?? 0;

    const marketOpen: number =
      oneMinOpen    > 0 ? oneMinOpen    :   // preferred: 1m 09:15 candle
      indicatorOpen > 0 ? indicatorOpen :   // fallback: 1d candle indicator
      metaOpen      > 0 ? metaOpen      :   // last resort: meta field
      0;

    return {
      ticker,
      symbol,
      shortName: meta.shortName ?? meta.longName ?? ticker,
      sector,
      regularMarketPrice: price,
      regularMarketOpen: marketOpen,
      regularMarketPreviousClose: prevClose,
      regularMarketChangePercent: Math.round(changePct * 10000) / 10000,
      regularMarketVolume: meta.regularMarketVolume ?? 0,
      // marketCap not available in v8/chart/meta — approximate from price * avg volume
      marketCap: (meta.regularMarketPrice ?? 0) * (meta.regularMarketVolume ?? 0),
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? 0,
      // v8 doesn't return 3-month avg volume directly; use current volume as proxy
      averageDailyVolume3Month: meta.regularMarketVolume ?? 0,
      regularMarketDayHigh: meta.regularMarketDayHigh ?? price,
      regularMarketDayLow: meta.regularMarketDayLow ?? price,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch quotes for a list of symbols in parallel (with a concurrency cap of 10).
 */
export async function fetchNSEQuotes(
  stocks: { symbol: string; ticker: string; sector: string }[]
): Promise<NSEQuote[]> {
  const CONCURRENCY = 10;
  const results: NSEQuote[] = [];

  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const batch = stocks.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(s => fetchSingleQuote(s.symbol, s.ticker, s.sector))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value !== null) {
        results.push(r.value);
      }
    }
  }

  return results;
}

/** Fetch all NSE universe stocks (55 stocks — used for projection scoring) */
export async function fetchAllNSEQuotes(): Promise<NSEQuote[]> {
  const quotes = await fetchNSEQuotes(NSE_UNIVERSE);
  if (quotes.length === 0) {
    throw new Error('No quotes returned from Yahoo Finance. Market may be closed or API unreachable.');
  }
  return quotes;
}

/**
 * Fetch all stocks in the broader actuals universe (~130 stocks — Nifty 100 + mid-caps).
 * Used exclusively for computing the "Actual Top Movers" in the retrospective audit.
 * Returns sorted by daily return DESC (top gainers first).
 */
export async function fetchActualMovers(topN = 10): Promise<Array<{
  ticker: string; sector: string; daily_return_pct: number; closing_price: number; volume_cr: number;
}>> {
  const quotes = await fetchNSEQuotes(NSE_ACTUALS_UNIVERSE);
  return quotes
    .map(q => ({
      ticker:           q.ticker,
      sector:           q.sector,
      daily_return_pct: Math.round(q.regularMarketChangePercent * 100) / 100,
      closing_price:    q.regularMarketPrice,
      volume_cr:        Math.round((q.regularMarketVolume * q.regularMarketPrice) / 1e7) / 100,
    }))
    .sort((a, b) => b.daily_return_pct - a.daily_return_pct)
    .slice(0, topN);
}

const THEMATIC_ALPHA: Record<string, string> = {
  // Large-caps
  RELIANCE: 'JIO_5G_Monetisation',      HDFCBANK: 'NIM_Expansion_Cycle',
  INFY: 'GenAI_Deal_Wins',              TCS: 'BFSI_Vertical_Recovery',
  ICICIBANK: 'Retail_Loan_Growth',      HINDUNILVR: 'Rural_Demand_Revival',
  SBIN: 'Credit_Cycle_Recovery',        BHARTIARTL: 'ARPU_Expansion',
  ITC: 'Cigarette_Volume_Revival',      KOTAKBANK: 'Digital_Banking_MOAT',
  LT: 'Order_Book_Surge',              AXISBANK: 'Embedded_Finance_Play',
  BAJFINANCE: 'Consumer_Credit_Boom',   MARUTI: 'EV_Transition_Hedge',
  TITAN: 'Premiumisation_Play',         WIPRO: 'Europe_Deal_Momentum',
  SUNPHARMA: 'US_FDA_Clearance_Pipeline', TATAMOTORS: 'JLR_EV_Ramp',
  NTPC: 'Renewable_Capacity_Build',     POWERGRID: 'Grid_Modernisation',
  ONGC: 'Crude_Price_Tailwind',         TATASTEEL: 'PLI_Steel_Upgrade',
  ADANIPORTS: 'Container_Volume_Surge', ULTRACEMCO: 'Infra_Capex_Cycle',
  BAJAJFINSV: 'Insurance_Value_Unlock', NESTLEIND: 'Premiumisation_FMCG',
  HCLTECH: 'Engineering_Services_Rebound', TECHM: 'Telecom_5G_IT_Play',
  DRREDDY: 'Complex_Generics_US',       CIPLA: 'Peptide_Pipeline_US',
  // Mid-caps ₹100–₹500
  PNB: 'PSU_Credit_Cycle_Revival',      CANBK: 'Govt_Recapitalisation_Play',
  BANKBARODA: 'International_Business_Growth', UNIONBANK: 'CASA_Improvement_Drive',
  INDIANB: 'South_India_Retail_Expansion',
  IOC: 'Refining_Margin_Recovery',      BPCL: 'Privatisation_Optionality',
  GAIL: 'Gas_Transmission_Expansion',   NMDC: 'Iron_Ore_Export_Tailwind',
  COALINDIA: 'Power_Sector_Demand_Surge', SAIL: 'PLI_Steel_Domestic',
  NHPC: 'Hydro_Capacity_Addition',      SJVN: 'Renewable_PSU_Expansion',
  RECLTD: 'Power_Sector_Lending_Boom',  PFC: 'Disccom_Loan_Growth',
  IRFC: 'Railway_Capex_Financing',      HUDCO: 'Urban_Housing_Finance',
  BHEL: 'Thermal_Order_Book_Revival',   RVNL: 'Railway_Infra_Pipeline',
  IREDA: 'Green_Energy_Financing',      TATAPOWER: 'Renewable_MW_Ramp',
  ZOMATO: 'Quick_Commerce_Profitability', NYKAA: 'Beauty_GMV_Acceleration',
};

const THESIS_MAP: Record<string, string> = {
  // Large-caps
  RELIANCE:   'Jio ARPU expansion above ₹200 as 5G subscriber base crosses 200Mn; retail EBITDA margin improvement to 8%.',
  HDFCBANK:   'NIM recovery post HDFC merger with CD ratio normalisation; credit costs stabilising at 60bps.',
  INFY:       'Large deal TCV of $4B+ in GenAI-enabled transformation with margin re-rating to 22%+.',
  TCS:        'BFSI vertical revival in North America with GenAI engagements contributing 8% of incremental revenue.',
  ICICIBANK:  'Retail and SME loan growth at 22% with GNPA reduction; fee income through embedded finance.',
  HINDUNILVR: 'Rural volume growth acceleration as commodity tailwinds support margin expansion; premiumisation 14% mix.',
  SBIN:       'Corporate credit cycle recovery with NIM expansion; CASA ratio holding above 45%.',
  BHARTIARTL: 'Africa segment EBITDA growth at 18% CAGR; India ARPU expansion through 5G upsell strategy.',
  ITC:        'Cigarette volume recovery post state tax normalisation; hotels and agri business demerger value unlock.',
  KOTAKBANK:  'Digital banking MOAT with lowest cost of funds in private banking; wealth management AUM crossing $25B.',
  LT:         'Order book at record ₹5.5L Cr with strong defence and infra pipeline; margin improvement to 9%.',
  AXISBANK:   'Retail loan growth 22% with GNPA reduction to 1.5%; fee income through embedded finance.',
  BAJFINANCE: 'New product launches in co-branded cards and SME lending driving AUM growth above 28% CAGR.',
  MARUTI:     'Hybrid vehicle technology leadership creating 18-month EV transition moat; 43%+ market share.',
  TITAN:      'Jewellery premiumisation driving ASP growth; watches and eyewear achieving category leadership.',
  WIPRO:      'European energy sector digital transformation partnership; EBIT margin improvement to 16.5%.',
  SUNPHARMA:  'Specialty pipeline in US with 6 NDA approvals expected; India branded generics at 14% market share.',
  TATAMOTORS: 'JLR EV ramp with Range Rover Electric launch; India PV market share growing in SUV segment.',
  NTPC:       'Renewable energy capacity target 60GW by FY32; green hydrogen pilot projects launched.',
  POWERGRID:  'Grid modernisation capex with TBCB project wins; regulated equity base growing 12% annually.',
  ONGC:       'Crude realisation above $80/bbl supporting exploration capex; domestic gas price supporting EBITDA.',
  TATASTEEL:  'UK operations breakeven by Q2FY27; India brownfield expansion adding 5MTPA capacity.',
  ADANIPORTS: 'Container throughput crossing 500MMT; value-added logistics EBITDA margins at 70%.',
  ULTRACEMCO: 'Capacity expansion 70MT by FY27 riding infrastructure capex cycle; cost leadership maintained.',
  BAJAJFINSV: 'Insurance subsidiaries value unlock; Bajaj Finance 15% revenue contribution growing.',
  NESTLEIND:  'Premiumisation in chocolates and dairy; e-commerce channel mix expanding to 18%.',
  HCLTECH:    'Engineering services rebound in auto and semiconductor verticals; offshoring tailwind.',
  TECHM:      'Telecom 5G IT spending revival; EBIT margin recovery to 12% on cost optimisation.',
  DRREDDY:    'Complex generics pipeline in US with 6 specialty launches; PSAI segment margin improvement.',
  CIPLA:      'Peptide and respiratory pipeline for US FDA approval; domestic formulations at 14% CAGR.',
  // Mid-caps ₹100–₹500
  PNB:        'Credit cost reduction to below 1.5% as NPA resolution completes; CASA ratio improving to 44%.',
  CANBK:      'Govt recapitalisation driving credit growth of 14% CAGR; slippage ratio down to 1.2%.',
  BANKBARODA: 'International business EBITDA recovery; domestic retail loan book growing 20% YoY.',
  UNIONBANK:  'CASA ratio improvement to 36% with digital branch expansion; GNPA below 5%.',
  INDIANB:    'South India retail asset book growing 18% with improving NIM to 3.3%.',
  IOC:        'GRM recovery above $8/bbl with petrochem margin expansion; dividend yield above 5%.',
  BPCL:       'Privatisation optionality premium; refinery upgrade driving GRM improvement to $9/bbl.',
  GAIL:       'Gas transmission volume growth 12% as city gas distribution expands; LNG marketing uplift.',
  NMDC:       'Iron ore volume target 50MT by FY27; steel plant commissioning adding value chain.',
  COALINDIA:  'Power sector coal demand surge driving production to 800MT; FSA price hike optionality.',
  SAIL:       'PLI scheme benefit for speciality steel; capacity utilisation improving to 90%.',
  NHPC:       'Hydro capacity addition of 2GW by FY27; regulated tariff providing earnings visibility.',
  SJVN:       'Renewable energy expansion to 5GW target with solar and hydro mix; PSU dividend play.',
  RECLTD:     'Power sector loan book growing 18% with thermal and renewable project financing.',
  PFC:        'Disccom loan restructuring supporting book quality; renewable project pipeline ₹2L Cr.',
  IRFC:       'Railway capex of ₹2.5L Cr annually providing assured AAA lending growth of 16%.',
  HUDCO:      'Urban housing finance demand from PM Awas Yojana; loan book growth 20% CAGR.',
  BHEL:       'Thermal order book revival with 10GW pipeline; power equipment export opportunity.',
  RVNL:       'Railway infra execution pipeline ₹70,000 Cr; international projects expanding revenue.',
  IREDA:      'Green energy financing CAGR 30%; NPA below 2% with project-backed loan security.',
  TATAPOWER:  'Renewable capacity 10GW by FY27; solar EPC order book ₹18,000 Cr.',
  ZOMATO:     'Quick commerce Blinkit reaching EBITDA breakeven; food delivery take rate expansion.',
  NYKAA:      'Beauty GMV acceleration 25% YoY; private label mix expanding to 15% of revenue.',
};

/**
 * Derive a conviction score (0-100) from real market data.
 * Uses a blend of: momentum (daily change), volume surge, 52-week range position
 */
export function deriveConvictionScore(quote: NSEQuote): number {
  const changePct = quote.regularMarketChangePercent;
  // Momentum component: map -5% to +5% → 30 to 70
  const momentum = Math.min(Math.max(50 + changePct * 4, 30), 70);

  // Volume surge component: current vs baseline (use same volume since 3m avg not in v8)
  // When data is symmetric, default to 50
  const volumeScore = 50;

  // 52-week range position: where is price in the 52-week range?
  let rangeScore = 50;
  const range = quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow;
  if (range > 0) {
    const pos = (quote.regularMarketPrice - quote.fiftyTwoWeekLow) / range;
    rangeScore = 40 + pos * 40; // 40 to 80
  }

  // Weighted blend
  const score = momentum * 0.5 + volumeScore * 0.3 + rangeScore * 0.2;
  return Math.round(score * 100) / 100;
}

/** Derive Level 7 flow direction from price momentum */
export function deriveFlow(quote: NSEQuote): 'Accumulation' | 'Neutral' | 'Distribution' {
  const changePct = quote.regularMarketChangePercent;
  if (changePct > 0.75) return 'Accumulation';
  if (changePct < -0.75) return 'Distribution';
  return 'Neutral';
}

export { THEMATIC_ALPHA, THESIS_MAP };
