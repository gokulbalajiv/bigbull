'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Calendar, Database, AlertCircle } from 'lucide-react';

// ─── Sub-components ───────────────────────────────────────────────────────────

function AuditRow({ row, colorKey }: { row: any; colorKey: 'projected' | 'actual' }) {
  const accent = colorKey === 'projected' ? '#f59e0b' : '#10b981';

  if (colorKey === 'actual') {
    const returnColor = row.daily_return_pct >= 0 ? '#10b981' : '#ef4444';
    return (
      <tr
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#1a1a1c')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
        style={{ borderBottom: '1px solid #1a1a1c', transition: 'background 0.1s ease' }}
      >
        <td style={{ padding: '12px 16px', color: '#3f3f46', fontFamily: 'monospace', fontSize: 11 }}>{row.rank}</td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, color: accent, fontSize: 12 }}>{row.ticker}</div>
          <div style={{ fontSize: 9, color: '#52525b', marginTop: 2, fontFamily: 'monospace' }}>{row.sector ?? '—'}</div>
        </td>
        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>
          {row.closing_price ? '₹' + row.closing_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: returnColor, fontWeight: 700, fontSize: 13 }}>
          {row.daily_return_pct > 0 ? '+' : ''}{row.daily_return_pct?.toFixed(2)}%
        </td>
      </tr>
    );
  }


  // Projected row with Target/Stop hit comparisons
  const fmtVal = (n?: number) => n ? '₹' + n.toFixed(2) : '—';

  const isHit = !!row.target_hit;
  const hasActualData = row.actual_high !== undefined;
  const statusColor = isHit ? '#10b981' : '#ef4444';
  const statusText  = isHit ? 'Hit' : 'Not Hit';

  return (
    <tr
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#1a1a1c')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      style={{ borderBottom: '1px solid #1a1a1c', transition: 'background 0.1s ease' }}
    >
      <td style={{ padding: '12px 16px', color: '#3f3f46', fontFamily: 'monospace', fontSize: 11 }}>{row.rank}</td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontWeight: 700, color: accent, fontSize: 12 }}>{row.ticker}</div>
        <div style={{ fontSize: 9, color: '#52525b', marginTop: 2, fontFamily: 'monospace' }}>
          Start: {fmtVal(row.day_start_price)}
        </div>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'monospace', color: '#a1a1aa' }}>
        <div><span style={{ color: '#10b981', fontWeight: 600 }}>T:</span> {fmtVal(row.projected_price)}</div>
        <div style={{ marginTop: 2 }}><span style={{ color: '#ef4444', fontWeight: 600 }}>S:</span> {fmtVal(row.stop_loss)}</div>
      </td>
      <td style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'monospace', color: '#a1a1aa' }}>
        {hasActualData ? (
          <>
            <div><span style={{ color: '#71717a' }}>Max:</span> {fmtVal(row.actual_high)}</div>
            <div style={{ marginTop: 2 }}><span style={{ color: '#71717a' }}>Min:</span> {fmtVal(row.actual_low)}</div>
          </>
        ) : (
          <span style={{ color: '#3f3f46' }}>—</span>
        )}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {hasActualData ? (
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 4,
            background: `${statusColor}18`, color: statusColor,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
            border: `1px solid ${statusColor}30`,
          }}>
            {statusText}
          </span>
        ) : (
          <span style={{ color: '#3f3f46', fontSize: 11 }}>—</span>
        )}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#fafafa', fontWeight: 600 }}>
        {row.conviction_score?.toFixed(1)}
      </td>
    </tr>
  );
}

function AuditTable({ data, colorKey }: { data: any[]; colorKey: 'projected' | 'actual' }) {
  const headers = colorKey === 'projected'
    ? ['#', 'Ticker', 'Target / Stop', 'Actual Max / Min', 'Status', 'Conviction']
    : ['#', 'Ticker', 'Close Price', 'Return %'];

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #1f1f21', background: '#0e0e10' }}>
          {headers.map(h => (
            <th key={h} style={{
              padding: '10px 16px',
              textAlign: h === 'Conviction' || h === 'Return %' ? 'right' : 'left',
              fontSize: 9, fontWeight: 600, color: '#3f3f46', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map(row => <AuditRow key={row.ticker} row={row} colorKey={colorKey} />)}
      </tbody>
    </table>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: '#0e0e10', borderRadius: 12, padding: '16px 20px', border: '1px solid #27272a' }}>
      <p style={{ fontSize: 10, color: '#52525b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color, margin: '6px 0 4px', fontFamily: 'monospace' }}>{value}</p>
      <p style={{ fontSize: 10, color: '#52525b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
    </div>
  );
}

/** Empty state shown when no data is stored for a date */
function NoDataState({ date }: { date: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 24px', gap: 12, color: '#52525b',
    }}>
      <Database size={32} strokeWidth={1.2} color="#27272a" />
      <p style={{ fontSize: 14, fontWeight: 600, color: '#3f3f46', margin: 0 }}>No data stored for {date}</p>
      <p style={{ fontSize: 12, color: '#27272a', margin: 0, textAlign: 'center', maxWidth: 320 }}>
        Real projection data is recorded from <span style={{ color: '#f59e0b' }}>8 June 2026</span> onwards.
        Past dates show stored engine output only — no generated data.
      </p>
    </div>
  );
}

/** Shown when actuals haven't been captured yet (market still open) */
function ActualsPending({ session }: { session: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '20px 24px', color: '#71717a', fontSize: 12,
    }}>
      <AlertCircle size={14} color="#f59e0b" />
      <span>
        Actuals are auto-saved after <span style={{ color: '#f59e0b' }}>15:30 IST</span> (post-close).
        {session === 'open' && ' Market is currently open — check back after close.'}
        {session === 'pre' && ' Market opens at 09:15 IST.'}
      </span>
    </div>
  );
}

function VarianceSection({ auditData }: { auditData: any }) {
  const { variance } = auditData;
  if (!auditData.has_actuals) return null;

  return (
    <section style={{ background: '#111113', borderRadius: 14, border: '1px solid #27272a', overflow: 'hidden' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid #27272a' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fafafa', margin: 0 }}>Variance Analysis</h2>
        <p style={{ fontSize: 11, color: '#52525b', margin: '4px 0 0' }}>
          Level 10 learning output ·{' '}
          <span style={{ color: '#10b981', fontFamily: 'monospace', fontSize: 10 }}>● Stored engine data</span>
          {' · '}
          <span style={{ color: '#f59e0b', fontFamily: 'monospace' }}>{auditData.date}</span>
        </p>
      </div>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
          <KpiCard label="Hit Rate" value={`${variance.delta_score_pct.toFixed(0)}%`} sub={`${variance.hits.length}/10 stocks matched`} color="#10b981" />
          <KpiCard label="Delta Score" value={`${variance.delta_score_pct.toFixed(1)}%`} sub="of actual move captured" color="#f59e0b" />
          <KpiCard label="Misses" value={String(variance.misses.length)} sub={variance.misses.join(', ') || 'None'} color="#ef4444" />
        </div>

        {/* Predicted vs Actual comparison chart */}
        {auditData.projected?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 10, color: '#52525b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                Predicted vs Actual Return (%)
              </p>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#71717a' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
                  Predicted
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
                  Actual max from open (Hit)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
                  Actual max from open (Not Hit)
                </span>
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={auditData.projected.map((p: any) => {
                    const open = p.day_start_price ?? 0;
                    // Max intraday gain from open — same baseline as upside_pct
                    const actualHigh = (p as any).actual_high;
                    const actualMaxFromOpen = open > 0 && actualHigh
                      ? parseFloat(((actualHigh - open) / open * 100).toFixed(2))
                      : null;
                    return {
                      ticker: p.ticker,
                      predicted: parseFloat((p.upside_pct ?? 0).toFixed(2)),
                      actual: actualMaxFromOpen,
                      hit: !!(p as any).target_hit,
                    };
                  })}
                  barGap={2}
                  barCategoryGap="28%"
                >
                  <XAxis
                    dataKey="ticker"
                    tick={{ fill: '#71717a', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#71717a', fontSize: 9 }}
                    unit="%"
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <ReferenceLine y={0} stroke="#27272a" />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}
                    itemStyle={{ color: '#ffffff' }}
                    formatter={(value: any, name: any) => {
                      if (value === null || value === undefined) return ['—', name === 'predicted' ? 'Predicted target' : 'Actual max from open'];
                      const label = name === 'predicted' ? 'Predicted target' : 'Actual max from open';
                      const val = `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
                      return [val, label] as [string, string];
                    }}
                  />
                  <Bar dataKey="predicted" fill="#f59e0b" opacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="actual" radius={[3, 3, 0, 0]} maxBarSize={28}>
                    {auditData.projected.map((p: any, i: number) => (
                      <Cell key={i} fill={(p as any).target_hit ? '#10b981' : '#ef4444'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: 10, color: '#3f3f46', marginTop: 6, textAlign: 'center' }}>
              Amber = predicted upside % from open · Green/Red = actual intraday high % from open
            </p>
          </div>
        )}

        {/* Not Hit breakdown — derived from projected stocks with target_hit=false */}
        {variance.misses.length > 0 && (
          <div>
            <p style={{ fontSize: 10, color: '#52525b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Not Hit — {variance.misses.length} projected target{variance.misses.length !== 1 ? 's' : ''} missed
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {variance.misses.map((ticker: string) => {
                const proj = auditData.projected?.find((p: any) => p.ticker === ticker);
                const actualEntry = auditData.actuals?.find((a: any) => a.ticker === ticker);
                const actualPct = actualEntry?.daily_return_pct ?? proj?.change_pct ?? 0;
                const predictedPct = proj?.upside_pct ?? 0;
                return (
                  <div key={ticker} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#0e0e10', borderRadius: 8, padding: '10px 14px', border: '1px solid #1f1f21',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{ticker}</span>
                      <span style={{ color: '#3f3f46' }}>·</span>
                      <span style={{ fontSize: 11, color: '#52525b' }}>
                        target not reached · actual {actualPct > 0 ? '+' : ''}{actualPct.toFixed(2)}%
                      </span>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#f59e0b' }}>
                      predicted +{predictedPct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const today = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === today;

  const { data: auditData, isLoading } = useQuery<any>({
    queryKey: ['audit', selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/audit?date=${selectedDate}`);
      return res.json();
    },
    // Today: always fresh (staleTime 0). Past dates: cache 24h (data never changes).
    staleTime: isToday ? 0 : 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: isToday,
    // Poll every 30s while market is closed but actuals haven't arrived yet
    refetchInterval: (query) => {
      const d = query.state.data as any;
      const session = d?.market_status?.session;
      const hasActuals = d?.has_actuals;
      const isPostClose = session === 'post' || session === 'closed';
      if (isToday && isPostClose && !hasActuals) return 30_000;
      return false;
    },
  });

  const available = auditData?.available_dates ?? [];
  // Always allow browsing last 180 days — empty state shown for dates without stored data
  const minDate = (() => { const d = new Date(); d.setDate(d.getDate() - 180); return d.toISOString().split('T')[0]; })();
  const maxDate = new Date().toISOString().split('T')[0];
  const marketSession = auditData?.market_status?.session ?? 'closed';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }} className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fafafa', margin: 0 }}>Retrospective Audit</h1>
        <p style={{ color: '#71717a', marginTop: 6, fontSize: 13, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
          Real stored engine data only — no generated or mock values
        </p>
      </div>

      {/* Date picker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: '#111113', border: '1px solid #27272a', borderRadius: 12,
        padding: '14px 20px', marginBottom: 24,
      }}>
        <Calendar size={14} color="#ffffff" />
        <label style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500 }}>Audit Date:</label>
        <input
          type="date" value={selectedDate} min={minDate} max={maxDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{
            background: '#1a1a1c', border: '1px solid #3f3f46', borderRadius: 8,
            padding: '6px 12px', fontSize: 13, color: '#ffffff', fontFamily: 'monospace',
            outline: 'none', cursor: 'pointer', colorScheme: 'dark',
          }}
        />
        {available.length > 0 ? (
          <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
            <span style={{ color: '#10b981' }}>{available.length}</span> day{available.length !== 1 ? 's' : ''} stored
            {available.length > 1 && (
              <> · <span style={{ color: '#f59e0b' }}>{available[available.length - 1]}</span>{' → '}<span style={{ color: '#10b981' }}>{available[0]}</span></>
            )}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#3f3f46', fontFamily: 'monospace' }}>No data stored yet</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#3f3f46' }}>7-day rolling · 180-day history</span>
      </div>

      {isLoading ? (
        <div className="shimmer-skeleton" style={{ height: 400, borderRadius: 14 }} />
      ) : !auditData?.has_data ? (
        <div style={{ background: '#111113', borderRadius: 14, border: '1px solid #27272a', overflow: 'hidden' }}>
          <NoDataState date={selectedDate} />
        </div>
      ) : (
        <>
          {/* Split View */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Projected */}
            <div style={{ background: '#111113', borderRadius: 14, border: '1px solid #27272a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#fafafa', margin: 0 }}>🔮 Projected Top 10</h2>
                  <p style={{ fontSize: 10, color: '#52525b', margin: '2px 0 0' }}>Engine output · Conviction rank · Stored</p>
                </div>
                <span style={{ fontSize: 10, color: '#10b981', fontFamily: 'monospace', background: 'rgba(16,185,129,0.08)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)' }}>
                  ● Real data
                </span>
              </div>
              <AuditTable data={auditData.projected} colorKey="projected" />
            </div>

            {/* Actuals */}
            <div style={{ background: '#111113', borderRadius: 14, border: '1px solid #27272a', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#fafafa', margin: 0 }}>📈 Actual Top 10</h2>
                  <p style={{ fontSize: 10, color: '#52525b', margin: '2px 0 0' }}>NSE Movers · Absolute return · {auditData.has_actuals ? 'Stored' : 'Pending'}</p>
                </div>
                {auditData.has_actuals
                  ? <span style={{ fontSize: 10, color: '#10b981', fontFamily: 'monospace', background: 'rgba(16,185,129,0.08)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)' }}>● Recorded</span>
                  : <span style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'monospace', background: 'rgba(245,158,11,0.08)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(245,158,11,0.2)' }}>◐ Pending</span>
                }
              </div>
              {auditData.has_actuals
                ? <AuditTable data={auditData.actuals} colorKey="actual" />
                : <ActualsPending session={marketSession} />
              }
            </div>
          </div>

          <VarianceSection auditData={auditData} />
        </>
      )}
    </div>
  );
}
