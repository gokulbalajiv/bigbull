'use client';
import { useQuery } from '@tanstack/react-query';
import { ProjectionTable } from './ProjectionTable';
import { MarketClosed } from '@/components/MarketClosed';
import { Zap, RefreshCw } from 'lucide-react';

function ConvictionGauge({ scores }: { scores: number[] }) {
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const pct = Math.min((avg / 100) * 100, 100);
  const color = pct > 75 ? '#10b981' : pct > 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, color: '#71717a', marginBottom: 4 }}>Avg Conviction</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 80, height: 6, background: '#27272a', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{avg.toFixed(1)}</span>
      </div>
    </div>
  );
}

export function ProjectionHero({ date }: { date: string }) {
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['projections', date],
    queryFn: async () => {
      const res = await fetch(`/api/projections?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw json;
      return json;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  if (isLoading) return <div className="shimmer-skeleton" style={{ height: 480, borderRadius: 16 }} />;

  // Weekend / market closed error
  if (error && (error as any).error === 'MARKET_CLOSED_WEEKEND') {
    return <MarketClosed message="NSE/BSE does not trade on weekends. Projections will resume Monday morning." nextOpen="Monday 09:15 AM IST" />;
  }

  if (error) {
    return (
      <div style={{ background: '#111113', borderRadius: 16, border: '1px solid #3f3f46', padding: 24, color: '#ef4444', fontSize: 13 }}>
        ⚠ Failed to load live market data. Yahoo Finance may be temporarily unavailable.
      </div>
    );
  }

  const projections = Array.isArray(data) ? data : [];
  const accumCount = projections.filter((d: any) => d.level7_flow === 'Accumulation').length;
  const distCount = projections.filter((d: any) => d.level7_flow === 'Distribution').length;

  return (
    <section style={{ background: '#111113', borderRadius: 16, border: '1px solid #27272a', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid #27272a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #111113 0%, #1a1a1c 100%)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="#f59e0b" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#fafafa', margin: 0 }}>Today's Top 10</h2>
            {isFetching && (
              <span style={{ fontSize: 10, color: '#52525b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> Live
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#52525b', margin: '4px 0 0' }}>
            Live NSE data · Yahoo Finance ·{' '}
            <span style={{ color: '#10b981' }}>↑ {accumCount} Accumulation</span>
            {' · '}
            <span style={{ color: '#ef4444' }}>↓ {distCount} Distribution</span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ConvictionGauge scores={projections.map((d: any) => d.conviction_score)} />
          <button
            onClick={() => refetch()}
            title="Refresh data"
            style={{
              background: '#1a1a1c', border: '1px solid #27272a', borderRadius: 8,
              padding: '6px 10px', cursor: 'pointer', color: '#71717a', display: 'flex', alignItems: 'center',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#3f3f46')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#27272a')}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <ProjectionTable data={projections} />
    </section>
  );
}
