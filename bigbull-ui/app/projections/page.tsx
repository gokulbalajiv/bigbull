'use client';
import { useQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { ProjectionHero } from '@/components/projections/ProjectionHero';
import { ProjectionHistory } from '@/components/projections/ProjectionHistory';
import { MarketClosed } from '@/components/MarketClosed';
import { Wifi, WifiOff, Clock } from 'lucide-react';

function MarketSessionBadge() {
  const { data } = useQuery({
    queryKey: ['engine-status'],
    queryFn: () => fetch('/api/engine/status').then(r => r.json()),
    refetchInterval: 60000,
  });

  if (!data) return null;

  const sessionColors: Record<string, { color: string; bg: string; label: string }> = {
    open:   { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '● Market Open' },
    pre:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '◐ Pre-Open' },
    post:   { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: '◑ Post-Close' },
    closed: { color: '#71717a', bg: 'rgba(113,113,122,0.1)', label: '○ Closed' },
  };

  const s = sessionColors[data.session] ?? sessionColors.closed;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        color: s.color, background: s.bg, border: `1px solid ${s.color}30`,
      }}>
        {s.label}
      </span>
      <span style={{ fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
        {data.istTime}
      </span>
    </div>
  );
}

export default function ProjectionsPage() {
  const today = new Date().toISOString().split('T')[0];

  const { data: engineStatus } = useQuery({
    queryKey: ['engine-status'],
    queryFn: () => fetch('/api/engine/status').then(r => r.json()),
  });

  const isWeekend = engineStatus?.isWeekend;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }} className="animate-fade-in">
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fafafa', margin: 0 }}>Daily Projection Board</h1>
          <p style={{ color: '#71717a', marginTop: 6, fontSize: 13, margin: '6px 0 0' }}>
            Engine output for{' '}
            <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontWeight: 600 }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </p>
        </div>
        <MarketSessionBadge />
      </div>

      {isWeekend ? (
        <MarketClosed
          message="NSE/BSE does not trade on weekends. The engine resumes Monday morning at 09:15 AM IST."
          nextOpen="Monday 09:15 AM IST"
        />
      ) : (
        <>
          <Suspense fallback={<div className="shimmer-skeleton" style={{ height: 480, borderRadius: 16 }} />}>
            <ProjectionHero date={today} />
          </Suspense>
          <div style={{ marginTop: 32 }}>
            <Suspense fallback={<div className="shimmer-skeleton" style={{ height: 200, borderRadius: 16 }} />}>
              <ProjectionHistory days={7} />
            </Suspense>
          </div>
        </>
      )}
    </div>
  );
}
