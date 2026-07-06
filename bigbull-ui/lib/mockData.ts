// Mock data for BigBull Engine — simulates DB responses

export interface Projection {
  rank: number;
  ticker: string;
  sector: string;
  conviction_score: number;
  conviction_prob: number;
  thematic_alpha: string;
  thesis_summary: string;
  level7_flow: 'Accumulation' | 'Neutral' | 'Distribution';
  hrp_weight: number;
  weight_pct: number;
  top_bullish_driver: string;
  top_bearish_drag: string;
}

export interface Actual {
  rank: number;
  ticker: string;
  daily_return_pct: number;
  institutional_volume: number;
  closing_price: number;
}

export interface VarianceData {
  delta_score_pct: number;
  hits: string[];
  misses: string[];
  learning_adjustments: {
    engine_level: string;
    modifier_key: string;
    old_value: number;
    new_value: number;
  }[];
}

export interface ThesisEntry {
  thesis_id: string;
  ticker: string;
  entry_date: string;
  core_milestone: string;
  invalidation_trigger: string;
  status: 'Strengthened' | 'Neutral' | 'Broken';
}

const TICKERS = [
  { ticker: 'RELIANCE', sector: 'Energy & Petrochemicals', alpha: 'JIO_5G_Monetisation' },
  { ticker: 'HDFCBANK', sector: 'Banking & Finance', alpha: 'NIM_Expansion_Cycle' },
  { ticker: 'INFY', sector: 'Information Technology', alpha: 'GenAI_Deal_Wins' },
  { ticker: 'TCS', sector: 'Information Technology', alpha: 'BFSI_Vertical_Recovery' },
  { ticker: 'ADANIPORTS', sector: 'Infrastructure & Logistics', alpha: 'Container_Volume_Surge' },
  { ticker: 'BAJFINANCE', sector: 'NBFC', alpha: 'Consumer_Credit_Boom' },
  { ticker: 'SUNPHARMA', sector: 'Pharmaceuticals', alpha: 'US_FDA_Clearance_Pipeline' },
  { ticker: 'TATASTEEL', sector: 'Metals & Mining', alpha: 'PLI_Steel_Upgrade' },
  { ticker: 'WIPRO', sector: 'Information Technology', alpha: 'Europe_Deal_Momentum' },
  { ticker: 'LTIM', sector: 'Information Technology', alpha: 'BFSI_Modernisation' },
  { ticker: 'MARUTI', sector: 'Automobiles', alpha: 'EV_Transition_Hedge' },
  { ticker: 'HINDUNILVR', sector: 'FMCG', alpha: 'Rural_Demand_Revival' },
  { ticker: 'ONGC', sector: 'Oil & Gas', alpha: 'Crude_Price_Tailwind' },
  { ticker: 'AXISBANK', sector: 'Banking & Finance', alpha: 'Retail_Loan_Growth' },
  { ticker: 'NTPC', sector: 'Power & Utilities', alpha: 'Renewable_Capacity_Build' },
];

const FLOWS: ('Accumulation' | 'Neutral' | 'Distribution')[] = ['Accumulation', 'Neutral', 'Distribution'];

const FEATURES = [
  'x1_macro_alignment', 'x2_thematic_momentum', 'x3_roce_zscore',
  'x4_retained_value_ratio', 'x5_expectations_gap_pct', 'x6_earnings_surprise',
  'x7_institutional_flow_cr', 'x8_thesis_strength'
];

const THESIS_MAP: Record<string, string> = {
  RELIANCE: 'Jio platforms ARPU expansion above ₹200 by Q3FY27 as 5G subscriber base crosses 200Mn; retail segment EBITDA margin improvement to 8%.',
  HDFCBANK: 'NIM recovery post HDFC merger integration with CD ratio normalisation below 110%; credit costs stabilising at 60bps.',
  INFY: 'Large deal TCV of $4B+ in GenAI-enabled transformation projects with margin re-rating to 22%+ on operating leverage.',
  TCS: 'BFSI vertical demand revival in North America with Generative AI engagements contributing 8% of incremental revenue by FY27.',
  ADANIPORTS: 'Container throughput crossing 500MMT milestone with value-added logistics EBITDA margins sustaining at 70%.',
  BAJFINANCE: 'New product launches in co-branded credit cards and SME lending driving AUM growth above 28% CAGR through FY26.',
  SUNPHARMA: 'Specialty pipeline in US with 6 NDA approvals expected in 18 months; India branded generics growing at 14% market share.',
  TATASTEEL: 'UK operations breakeven by Q2FY27 as European capacity rationalises; India brownfield expansion adding 5MTPA capacity.',
  WIPRO: 'Strategic partnership with Capgemini for European energy sector digital transformation; EBIT margin improvement to 16.5%.',
  LTIM: 'Insurance sector modernisation wins creating $2B pipeline; utilisation rates improving above 85% on headcount discipline.',
  MARUTI: 'Hybrid vehicle technology leadership creating 18-month EV transition moat; market share holding above 43% in passenger vehicles.',
  HINDUNILVR: 'Rural volume growth acceleration to 8% as commodity tailwinds support margin expansion; premiumisation driving 14% revenue mix.',
  ONGC: 'Crude realisation above $80/bbl supporting exploration capex cycle; natural gas price hike boosting domestic business EBITDA.',
  AXISBANK: 'Retail and SME loan growth at 22% with GNPA reduction to 1.5%; fee income acceleration through embedded finance products.',
  NTPC: 'Renewable energy capacity target of 60GW by FY32 with green hydrogen pilot projects; regulated equity base growing 12% annually.',
};

const INVALIDATION: Record<string, string> = {
  RELIANCE: 'Jio ARPU falls below ₹180 or retail segment losses widen beyond ₹2000Cr quarterly.',
  HDFCBANK: 'CD ratio breaches 115% or gross slippages exceed 2.5% in consecutive quarters.',
  INFY: 'Large deal TCV falls below $3B for two consecutive quarters or attrition spikes above 22%.',
  TCS: 'BFSI revenue decline exceeds 3% QoQ or GenAI projects face client budget freezes.',
  ADANIPORTS: 'Regulatory action on Adani Group entities or container volume growth dips below 8% YoY.',
  BAJFINANCE: 'Stage-2 assets breach 8% of AUM or RBI tightening on personal loans impacts NII.',
  SUNPHARMA: 'US FDA import alert on key facilities or specialty product pricing erosion exceeds 12%.',
  TATASTEEL: 'Iron ore prices spike above $140/MT or UK operations generate quarterly EBITDA loss exceeding ₹1500Cr.',
  WIPRO: 'European client budget cuts reduce deal sizes below $50M average or EBIT margin dips below 15%.',
  LTIM: 'Insurance sector IT spending freeze or utilisation rate falls below 81% for two consecutive quarters.',
  MARUTI: 'Market share loss below 40% to new EV entrants or input cost inflation exceeds 5% on semiconductor shortages.',
  HINDUNILVR: 'Rural demand reversal due to monsoon failure or crude-linked packaging cost surge above 15%.',
  ONGC: 'Crude falls below $65/bbl sustained for 60 days or domestic gas price revision reversed.',
  AXISBANK: 'GNPA inches above 2% or RBI penalty action on credit card practices.',
  NTPC: 'Renewable energy capex cost overruns above 20% or grid evacuation bottlenecks delay commissioning.',
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateProjectionsForDate(dateStr: string): Projection[] {
  const seed = dateStr.split('-').reduce((a, b) => a + parseInt(b), 0);
  const shuffled = [...TICKERS].sort((a, b) => seededRandom(seed + a.ticker.length) - seededRandom(seed + b.ticker.length));
  const selected = shuffled.slice(0, 10);
  
  let totalWeight = 0;
  const weights = selected.map((_, idx) => {
    const w = 0.05 + seededRandom(seed + idx * 5) * 0.15;
    totalWeight += w;
    return w;
  });

  return selected.map((item, idx) => {
    const flowIdx = Math.floor(seededRandom(seed + idx * 17) * 3);
    const baseScore = 65 + seededRandom(seed + idx * 7) * 30;
    const hrpWeight = weights[idx] / totalWeight;
    const bullishIdx = Math.floor(seededRandom(seed + idx) * FEATURES.length);
    const bearishIdx = (bullishIdx + 2) % FEATURES.length;
    
    return {
      rank: idx + 1,
      ticker: item.ticker,
      sector: item.sector,
      conviction_prob: Math.round((baseScore / 100) * 10000) / 10000,
      conviction_score: Math.round(baseScore * 100) / 100,
      thematic_alpha: item.alpha,
      thesis_summary: THESIS_MAP[item.ticker] || 'Strong fundamental case with positive sector tailwinds.',
      level7_flow: FLOWS[flowIdx],
      hrp_weight: hrpWeight,
      weight_pct: Math.round(hrpWeight * 10000) / 100,
      top_bullish_driver: FEATURES[bullishIdx],
      top_bearish_drag: FEATURES[bearishIdx],
    };
  });
}

function generateActualsForDate(dateStr: string): Actual[] {
  const seed = dateStr.split('-').reduce((a, b) => a + parseInt(b), 0) + 999;
  const shuffled = [...TICKERS].sort((a, b) => seededRandom(seed + a.ticker.length) - seededRandom(seed + b.ticker.length));
  const selected = shuffled.slice(0, 10);

  return selected.map((item, idx) => {
    const returnPct = (seededRandom(seed + idx * 13) * 6) - 0.5;
    return {
      rank: idx + 1,
      ticker: item.ticker,
      daily_return_pct: Math.round(returnPct * 100) / 100,
      institutional_volume: Math.round(seededRandom(seed + idx * 5) * 2000 + 100),
      closing_price: Math.round(seededRandom(seed + idx * 11) * 3000 + 200),
    };
  });
}

function generateVarianceForDate(dateStr: string): VarianceData {
  const projections = generateProjectionsForDate(dateStr);
  const actuals = generateActualsForDate(dateStr);
  
  const projSet = new Set(projections.map(p => p.ticker));
  const actualTickers = actuals.map(a => a.ticker);
  const hits = actualTickers.filter(t => projSet.has(t));
  const misses = actualTickers.filter(t => !projSet.has(t));
  
  const seed = dateStr.split('-').reduce((a, b) => a + parseInt(b), 0);
  const learningAdjustments = [
    { engine_level: 'Level_1', modifier_key: 'CRUDE_DANGER_THRESHOLD', old_value: 85.00, new_value: 85.00 + seededRandom(seed) * 5 - 2.5 },
    { engine_level: 'Level_5', modifier_key: 'PEG_CONSTANT', old_value: 1.50, new_value: 1.50 + seededRandom(seed + 1) * 0.2 - 0.1 },
    { engine_level: 'Level_7', modifier_key: 'INSTITUTIONAL_ACCUMULATION_MIN_CR', old_value: 50.00, new_value: 50 + seededRandom(seed + 2) * 10 - 5 },
  ].map(a => ({ ...a, old_value: Math.round(a.old_value * 100) / 100, new_value: Math.round(a.new_value * 100) / 100 }));

  return {
    delta_score_pct: (hits.length / 10) * 100,
    hits,
    misses,
    learning_adjustments: learningAdjustments,
  };
}

function generateThesisLedger(): ThesisEntry[] {
  const statuses: ('Strengthened' | 'Neutral' | 'Broken')[] = ['Strengthened', 'Neutral', 'Broken'];
  return TICKERS.map((item, idx) => {
    const statusIdx = Math.floor(seededRandom(idx * 37 + 100) * 3);
    const daysAgo = Math.floor(seededRandom(idx * 11) * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return {
      thesis_id: `thesis-${item.ticker.toLowerCase()}-${idx}`,
      ticker: item.ticker,
      entry_date: date.toISOString().split('T')[0],
      core_milestone: THESIS_MAP[item.ticker] || 'Strong fundamental case.',
      invalidation_trigger: INVALIDATION[item.ticker] || 'Material deterioration in business fundamentals.',
      status: statuses[statusIdx],
    };
  });
}

// Export functions
export { generateProjectionsForDate, generateActualsForDate, generateVarianceForDate, generateThesisLedger };
