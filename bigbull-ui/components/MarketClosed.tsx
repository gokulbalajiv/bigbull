'use client';
import { Moon, Calendar } from 'lucide-react';

interface Props {
  message?: string;
  nextOpen?: string;
}

export function MarketClosed({ message, nextOpen }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 400,
        gap: 20,
        padding: 48,
        background: '#111113',
        borderRadius: 16,
        border: '1px solid #27272a',
        textAlign: 'center',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Moon size={28} color="#f59e0b" />
      </div>

      {/* Title */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fafafa', margin: '0 0 8px' }}>
          Market Closed
        </h2>
        <p style={{ fontSize: 14, color: '#71717a', margin: 0 }}>
          {message ?? 'NSE/BSE does not trade on weekends.'}
        </p>
      </div>

      {/* Next open */}
      {nextOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            background: '#1a1a1c',
            border: '1px solid #27272a',
            borderRadius: 10,
            fontSize: 12,
            color: '#a1a1aa',
          }}
        >
          <Calendar size={13} color="#52525b" />
          Next session opens: <span style={{ color: '#f59e0b', fontFamily: 'monospace', fontWeight: 600 }}>{nextOpen}</span>
        </div>
      )}

      {/* Decorative grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 8 }}>
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              background: i % 3 === 0 ? '#27272a' : '#1f1f21',
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
