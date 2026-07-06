'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, BookOpen, Settings, TrendingUp, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const navItems = [
  { href: '/projections', label: 'Daily Projections',  icon: TrendingUp },
  { href: '/audit',       label: 'Retrospective Audit', icon: BarChart2  },
  { href: '/thesis',      label: 'Thesis Ledger',       icon: BookOpen   },
  { href: '/settings',    label: 'Engine Settings',     icon: Settings   },
];

const statusColors: Record<string, string> = {
  PUBLISHED: '#10b981',
  RUNNING:   '#f59e0b',
  IDLE:      '#10b981',
  HALTED:    '#ef4444',
};

function EngineStatusBadge() {
  const { data } = useQuery({
    queryKey: ['engine-status'],
    queryFn: () => fetch('/api/engine/status').then(r => r.json()),
    refetchInterval: 30000,
  });

  const status = data?.status ?? 'IDLE';
  const color = statusColors[status] ?? '#71717a';

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 0 0 ${color}55`,
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
        />
        <span style={{ fontSize: 11, color: '#71717a' }}>
          Engine: <span style={{ color, fontFamily: 'monospace', fontWeight: 600 }}>{status}</span>
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#52525b', fontFamily: 'monospace' }}>
        {data?.equities_scanned?.toLocaleString() ?? '1,847'} equities scanned
      </div>
      <div style={{ fontSize: 10, color: '#52525b', marginTop: 2 }}>
        Next: {data?.next_run ?? '08:00 AM IST'}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 256,
        flexShrink: 0,
        background: '#111113',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          borderBottom: '1px solid #27272a',
          background: 'linear-gradient(135deg, #111113 0%, #18181b 100%)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🐂</span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#f59e0b',
                letterSpacing: '-0.5px',
              }}
            >
              BigBull Engine
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#52525b', marginTop: 2, letterSpacing: '0.05em' }}>
            NSE/BSE EQUITIES INTELLIGENCE
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                background: active ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                color: active ? '#f59e0b' : '#a1a1aa',
                border: active ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid transparent',
              }}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Engine Status */}
      <div style={{ padding: '0 20px 16px', borderTop: '1px solid #27272a' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 0 6px',
            fontSize: 10,
            color: '#52525b',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <Activity size={10} />
          Engine Status
        </div>
        <EngineStatusBadge />
      </div>
    </aside>
  );
}
