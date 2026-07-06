'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Google Finance research integration ─────────────────────────────────────

function googleFinanceUrl(ticker: string) {
  return `https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:NSE`;
}

interface FundamentalData {
  ticker:           string;
  trailingPE:       number | null;
  forwardPE:        number | null;
  priceToBook:      number | null;
  trailingEps:      number | null;
  targetMeanPrice:  number | null;
  targetHighPrice:  number | null;
  targetLowPrice:   number | null;
  analystCount:     number | null;
  recommendation:   string | null;
  marketCap:        number | null;
  dividendYield:    number | null;
  googleFinanceUrl: string;
  googleNewsUrl:    string;
  error?:           string;
}

function recStyle(key: string | null): { text: string; color: string } {
  switch (key) {
    case 'strongBuy':  return { text: 'Strong Buy',  color: '#10b981' };
    case 'buy':        return { text: 'Buy',          color: '#34d399' };
    case 'hold':       return { text: 'Hold',         color: '#f59e0b' };
    case 'sell':       return { text: 'Sell',         color: '#f87171' };
    case 'strongSell': return { text: 'Strong Sell',  color: '#ef4444' };
    default:           return { text: '—',            color: '#52525b' };
  }
}

function fmtCap(v: number | null) {
  if (!v || v <= 0) return '—';
  const cr = v / 1e7;
  if (cr >= 100_000) return `₹${(cr / 100_000).toFixed(1)}L Cr`;
  if (cr >= 1_000)   return `₹${(cr / 1_000).toFixed(1)}K Cr`;
  return `₹${cr.toFixed(0)} Cr`;
}

function fmtNum(v: number | null, dp = 2) {
  return v !== null && v !== undefined ? v.toFixed(dp) : '—';
}

export interface Projection {
  rank: number;
  ticker: string;
  sector: string;
  conviction_score: number;
  thematic_alpha: string;
  thesis_summary: string;
  level7_flow: 'Accumulation' | 'Neutral' | 'Distribution';
  day_start_price: number;
  regularMarketOpen?: number;   // populated when market has opened
  current_price: number;
  change_pct: number;
  projected_price: number;
  stop_loss: number;
  upside_pct: number;
  risk_pct: number;
}

interface LivePrice {
  price: number;
  change_pct: number;
  prev_close: number;
  fetched_at: string;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

const flowStyles: Record<string, { bg: string; color: string; border: string; dot: string }> = {
  Accumulation: { bg: 'rgba(16,185,129,0.08)',  color: '#10b981', border: 'rgba(16,185,129,0.2)', dot: '#10b981' },
  Neutral:      { bg: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)', dot: '#71717a' },
  Distribution: { bg: 'rgba(239,68,68,0.08)',   color: '#ef4444', border: 'rgba(239,68,68,0.2)',  dot: '#ef4444' },
};

function ScoreMeter({ score }: { score: number }) {
  const pct   = Math.min((score / 100) * 100, 100);
  const color = pct > 75 ? '#10b981' : pct > 55 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ width: 48, height: 4, background: '#27272a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Flashes green/red when price updates */
function PriceCell({
  current, change_pct, live, isUpdating, dayStart,
}: {
  current: number; change_pct: number; live?: LivePrice; isUpdating: boolean; dayStart: number;
}) {
  const price    = live?.price ?? current;
  // Always show % relative to frozen day_start_price, not Yahoo's prevClose-based change_pct
  const chgPct   = dayStart > 0 ? ((price - dayStart) / dayStart) * 100 : change_pct;
  const positive = chgPct >= 0;
  const chColor  = positive ? '#10b981' : '#ef4444';
  const chSign   = positive ? '+' : '';

  return (
    <div>
      <div style={{
        fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
        color: isUpdating ? (positive ? '#10b981' : '#ef4444') : '#fafafa',
        transition: 'color 0.4s ease',
      }}>
        {fmt(price)}
      </div>
      <div style={{
        fontSize: 10, color: chColor, marginTop: 2, fontFamily: 'monospace',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {/* Live pulse dot */}
        <span style={{
          display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
          background: chColor,
          boxShadow: `0 0 4px ${chColor}`,
          animation: 'livePulse 2s ease-in-out infinite',
        }} />
        {chSign}{chgPct.toFixed(2)}%
      </div>
    </div>
  );
}

function DayStartCell({ price, isOpen }: { price: number; isOpen: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#a1a1aa' }}>
        {fmt(price)}
      </div>
      <div style={{ fontSize: 10, marginTop: 2, color: '#52525b', fontFamily: 'monospace' }}>
        {isOpen ? 'Day Open' : 'Prev Close'}
      </div>
    </div>
  );
}

function TargetCell({ projected, upside_pct }: { projected: number; upside_pct: number }) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981', fontSize: 13 }}>
        {fmt(projected)}
      </div>
      <div style={{ fontSize: 10, marginTop: 2, fontFamily: 'monospace', color: '#10b981', opacity: 0.75, display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderBottom: '5px solid #10b981' }} />
        +{upside_pct.toFixed(2)}%
      </div>
    </div>
  );
}

function StopCell({ stop_loss, risk_pct }: { stop_loss: number; risk_pct: number }) {
  return (
    <div>
      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ef4444', fontSize: 13 }}>
        {fmt(stop_loss)}
      </div>
      <div style={{ fontSize: 10, marginTop: 2, fontFamily: 'monospace', color: '#ef4444', opacity: 0.75, display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '5px solid #ef4444' }} />
        -{risk_pct.toFixed(2)}%
      </div>
    </div>
  );
}

function ProjectionRow({
  row, live, isUpdating,
}: {
  row: Projection; live?: LivePrice; isUpdating: boolean;
}) {
  const flow = flowStyles[row.level7_flow] ?? flowStyles.Neutral;
  const [hovered,   setHovered]   = useState(false);
  const [research,  setResearch]  = useState<FundamentalData | null>(null);
  const [resLoading, setResLoading] = useState(false);

  // Lazy-fetch fundamentals on first hover
  const fetchResearch = useCallback(async () => {
    if (research || resLoading) return;
    setResLoading(true);
    try {
      const res = await fetch(`/api/research?tickers=${row.ticker}`);
      if (res.ok) {
        const d = await res.json();
        const found = d.tickers?.find((t: FundamentalData) => t.ticker === row.ticker);
        if (found) setResearch(found);
      }
    } catch {
      // silently fail
    } finally {
      setResLoading(false);
    }
  }, [row.ticker, research, resLoading]);

  const rec = recStyle(research?.recommendation ?? null);

  return (
    <>
      <tr
        onMouseEnter={() => { setHovered(true); fetchResearch(); }}
        onMouseLeave={() => setHovered(false)}
        style={{ borderBottom: hovered ? 'none' : '1px solid #1f1f21', transition: 'background 0.12s ease', cursor: 'pointer', background: hovered ? '#1a1a1c' : 'transparent' }}
      >
      {/* Rank */}
      <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: '#52525b', fontSize: 12 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 6,
          background: row.rank <= 3 ? 'rgba(245,158,11,0.12)' : '#1f1f21',
          color:      row.rank <= 3 ? '#f59e0b' : '#71717a',
          fontSize: 11, fontWeight: 700,
        }}>
          {row.rank}
        </span>
      </td>

      {/* Ticker / Theme — clickable Google Finance link */}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a
            href={googleFinanceUrl(row.ticker)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Open in Google Finance"
            style={{
              fontWeight: 800, color: '#f59e0b', fontSize: 13,
              letterSpacing: '0.02em', textDecoration: 'none',
              borderBottom: '1px dotted rgba(245,158,11,0.4)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fcd34d')}
            onMouseLeave={e => (e.currentTarget.style.color = '#f59e0b')}
          >
            {row.ticker}
          </a>
          {/* GF icon */}
          <a
            href={googleFinanceUrl(row.ticker)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Google Finance"
            style={{ lineHeight: 0, opacity: 0.5, transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
        <div style={{ fontSize: 10, color: '#52525b', marginTop: 2, fontFamily: 'monospace' }}>
          {row.thematic_alpha.replace(/_/g, ' ')}
        </div>
      </td>

      {/* Sector */}
      <td style={{ padding: '14px 16px', color: '#a1a1aa', fontSize: 12 }}>{row.sector}</td>

      {/* Day Start Price */}
      <td style={{ padding: '14px 16px' }}>
        <DayStartCell
          price={row.day_start_price ?? row.current_price}
          isOpen={!!(row.regularMarketOpen && row.regularMarketOpen > 0)}
        />
      </td>

      {/* Current Price — live */}
      <td style={{ padding: '14px 16px' }}>
        <PriceCell
          current={row.current_price}
          change_pct={row.change_pct}
          live={live}
          isUpdating={isUpdating}
          dayStart={row.day_start_price ?? row.current_price}
        />
      </td>

      {/* Target */}
      <td style={{ padding: '14px 16px' }}>
        <TargetCell projected={row.projected_price} upside_pct={row.upside_pct} />
      </td>

      {/* Stop Loss */}
      <td style={{ padding: '14px 16px' }}>
        <StopCell stop_loss={row.stop_loss} risk_pct={row.risk_pct} />
      </td>

      {/* Conviction */}
      <td style={{ padding: '14px 16px' }}><ScoreMeter score={row.conviction_score} /></td>

      {/* Flow */}
      <td style={{ padding: '14px 16px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
          background: flow.bg, color: flow.color, border: `1px solid ${flow.border}`,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: flow.dot, display: 'inline-block' }} />
          {row.level7_flow}
        </span>
      </td>
    </tr>

      {/* Research panel — shows on hover */}
      {hovered && (
        <tr style={{ background: '#111113', borderBottom: '1px solid #1f1f21' }}>
          <td colSpan={9} style={{ padding: '0 16px 12px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>

              {resLoading && (
                <span style={{ fontSize: 10, color: '#3f3f46', fontFamily: 'monospace' }}>Loading research…</span>
              )}

              {research && !research.error && (
                <>
                  {/* Valuation */}
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'P/E (TTM)',  val: fmtNum(research.trailingPE, 1) },
                      { label: 'Fwd P/E',   val: fmtNum(research.forwardPE,  1) },
                      { label: 'P/B',       val: fmtNum(research.priceToBook, 2) },
                      { label: 'EPS',       val: research.trailingEps !== null ? `₹${fmtNum(research.trailingEps, 2)}` : '—' },
                      { label: 'Mkt Cap',   val: fmtCap(research.marketCap) },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ fontSize: 12, color: '#fafafa', fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, height: 32, background: '#27272a', flexShrink: 0 }} />

                  {/* Analyst consensus */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Consensus</div>
                      <div style={{ fontSize: 12, color: rec.color, fontFamily: 'monospace', fontWeight: 700, marginTop: 2 }}>{rec.text}</div>
                    </div>
                    {research.analystCount !== null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Analysts</div>
                        <div style={{ fontSize: 12, color: '#a1a1aa', fontFamily: 'monospace', fontWeight: 600, marginTop: 2 }}>{research.analystCount}</div>
                      </div>
                    )}
                    {research.targetMeanPrice !== null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#52525b', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Target</div>
                        <div style={{ fontSize: 12, color: '#10b981', fontFamily: 'monospace', fontWeight: 700, marginTop: 2 }}>
                          ₹{research.targetMeanPrice.toFixed(0)}
                          {research.targetLowPrice !== null && research.targetHighPrice !== null && (
                            <span style={{ color: '#52525b', fontWeight: 400, fontSize: 10 }}>
                              {' '}(₹{research.targetLowPrice.toFixed(0)}–₹{research.targetHighPrice.toFixed(0)})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, height: 32, background: '#27272a', flexShrink: 0 }} />

                  {/* Google Finance link */}
                  <a
                    href={research.googleFinanceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, color: '#4285F4', fontWeight: 600, textDecoration: 'none',
                      padding: '4px 10px', borderRadius: 6,
                      border: '1px solid rgba(66,133,244,0.3)',
                      background: 'rgba(66,133,244,0.07)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(66,133,244,0.15)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(66,133,244,0.07)')}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4285F4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                    Google Finance
                  </a>

                  <a
                    href={research.googleNewsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, color: '#71717a', fontWeight: 600, textDecoration: 'none',
                      padding: '4px 10px', borderRadius: 6,
                      border: '1px solid #27272a',
                      background: '#1a1a1c',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#27272a')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#1a1a1c')}
                  >
                    🗞️ News
                  </a>
                </>
              )}

              {research?.error && (
                <span style={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>Research unavailable</span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const HEADERS = [
  { label: 'Rank',           align: 'left'  },
  { label: 'Ticker / Theme', align: 'left'  },
  { label: 'Sector',         align: 'left'  },
  { label: 'Day Start',      align: 'left'  },
  { label: 'Current',        align: 'left'  },
  { label: 'Target',         align: 'left',  accent: 'green' },
  { label: 'Stop',           align: 'left',  accent: 'red'   },
  { label: 'Conviction',     align: 'right' },
  { label: 'Flow',           align: 'left'  },
];

/** Hook: polls /api/prices every 30s for the given tickers */
function useLivePrices(tickers: string[]) {
  const [prices, setPrices]       = useState<Record<string, LivePrice>>({});
  const [updating, setUpdating]   = useState<Record<string, boolean>>({});
  const [lastTick, setLastTick]   = useState<string>('');
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) return;
    try {
      const res = await fetch(`/api/prices?tickers=${tickers.join(',')}`);
      if (!res.ok) return;
      const data: Record<string, LivePrice> = await res.json();

      // Flash update indicator for 1s
      const updatedKeys = Object.keys(data);
      setUpdating(Object.fromEntries(updatedKeys.map(k => [k, true])));
      setTimeout(() => setUpdating({}), 1000);

      setPrices(data);
      setLastTick(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // silently fail — keep showing last known prices
    }
  }, [tickers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPrices();
    intervalRef.current = setInterval(fetchPrices, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchPrices]);

  return { prices, updating, lastTick };
}

export function ProjectionTable({ data }: { data: Projection[] }) {
  const tickers                  = data.map(d => d.ticker);
  const { prices, updating, lastTick } = useLivePrices(tickers);

  return (
    <div>
      {/* Live ticker bar */}
      {lastTick && (
        <div style={{
          padding: '6px 16px', borderBottom: '1px solid #1f1f21',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(16,185,129,0.04)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#10b981',
            boxShadow: '0 0 6px #10b981', display: 'inline-block',
            animation: 'livePulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
            Prices updated at <span style={{ color: '#10b981' }}>{lastTick} IST</span>
            {' · '}refreshes every 30s
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <style>{`
          @keyframes livePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #27272a' }}>
              {HEADERS.map(h => (
                <th
                  key={h.label}
                  style={{
                    padding: '10px 16px',
                    textAlign: h.align as 'left' | 'right',
                    fontSize: 10, fontWeight: 600,
                    color: h.accent === 'green' ? '#10b981' : h.accent === 'red' ? '#ef4444' : '#52525b',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    background: '#0e0e10', whiteSpace: 'nowrap',
                  }}
                >
                  {h.label === 'Target'
                    ? <><span style={{ color: '#10b981' }}>Target</span> <span style={{ opacity: 0.6 }}>▲</span></>
                    : h.label === 'Stop'
                    ? <><span style={{ color: '#ef4444' }}>Stop</span> <span style={{ opacity: 0.6 }}>▼</span></>
                    : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <ProjectionRow
                key={row.ticker}
                row={row}
                live={prices[row.ticker]}
                isUpdating={!!updating[row.ticker]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
