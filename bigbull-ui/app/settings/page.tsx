'use client';
import { Settings, Database, Zap, Shield, RefreshCw } from 'lucide-react';

const modifiers = [
  { level: 'Level_1', key: 'CRUDE_DANGER_THRESHOLD', value: 85.00, base: 85.00, unit: '$/bbl' },
  { level: 'Level_1', key: 'YIELD_CURVE_WEIGHT', value: 0.35, base: 0.35, unit: '' },
  { level: 'Level_1', key: 'CURRENCY_IMPACT_MULTIPLIER', value: 1.20, base: 1.20, unit: 'x' },
  { level: 'Level_2', key: 'MIN_THEME_SCORE', value: 65.00, base: 65.00, unit: '' },
  { level: 'Level_2', key: 'NLP_KEYWORD_MULTIPLIER', value: 1.15, base: 1.15, unit: 'x' },
  { level: 'Level_3', key: 'MARGIN_PREMIUM_WEIGHT', value: 0.40, base: 0.40, unit: '' },
  { level: 'Level_5', key: 'PEG_CONSTANT', value: 1.50, base: 1.50, unit: '' },
  { level: 'Level_7', key: 'INSTITUTIONAL_ACCUMULATION_MIN_CR', value: 50.00, base: 50.00, unit: '₹Cr' },
  { level: 'Level_9', key: 'MAX_SECTOR_CONCENTRATION', value: 30.00, base: 30.00, unit: '%' },
  { level: 'Level_9', key: 'MAX_BETA', value: 1.35, base: 1.35, unit: '' },
  { level: 'Level_10', key: 'LEARNING_RATE_ALPHA', value: 0.05, base: 0.05, unit: '' },
  { level: 'Level_10', key: 'ROLLING_AUDIT_WINDOW_DAYS', value: 14.00, base: 14.00, unit: 'd' },
];

const levelColors: Record<string, string> = {
  Level_1: '#f59e0b', Level_2: '#8b5cf6', Level_3: '#3b82f6',
  Level_5: '#10b981', Level_7: '#ec4899', Level_9: '#f97316', Level_10: '#06b6d4',
};

function ModifierRow({ mod }: { mod: typeof modifiers[0] }) {
  const drift = ((mod.value - mod.base) / mod.base) * 100;
  const levelColor = levelColors[mod.level] ?? '#71717a';
  return (
    <tr
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#1a1a1c')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
      style={{ borderBottom: '1px solid #1a1a1c', transition: 'background 0.1s ease' }}
    >
      <td style={{ padding: '12px 20px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 6,
          background: `${levelColor}14`, color: levelColor, fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
        }}>
          {mod.level}
        </span>
      </td>
      <td style={{ padding: '12px 20px', color: '#a1a1aa', fontFamily: 'monospace', fontSize: 11 }}>
        {mod.key.replace(/_/g, ' ')}
      </td>
      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'monospace', color: '#fafafa', fontWeight: 600 }}>
        {mod.value.toFixed(2)}{mod.unit}
      </td>
      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'monospace', color: '#52525b' }}>
        {mod.base.toFixed(2)}{mod.unit}
      </td>
      <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'monospace', fontSize: 10 }}>
        <span style={{ color: Math.abs(drift) < 0.01 ? '#52525b' : drift > 0 ? '#10b981' : '#ef4444' }}>
          {Math.abs(drift) < 0.01 ? 'Baseline' : `${drift > 0 ? '+' : ''}${drift.toFixed(2)}%`}
        </span>
      </td>
    </tr>
  );
}

export default function SettingsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }} className="animate-fade-in">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Settings size={22} color="#f59e0b" />
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fafafa', margin: 0 }}>Engine Settings</h1>
        </div>
        <p style={{ color: '#71717a', fontSize: 13, margin: 0 }}>
          Live modifier state · Adjusted dynamically by Level 10 retrospective learning
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { icon: <Database size={14} />, label: 'Data Source', value: 'Yahoo Finance', sub: 'Nifty 100 + Mid-caps' },
          { icon: <Zap size={14} />, label: 'Schedule', value: 'CRON 09:15 IST', sub: 'Mon–Fri only' },
          { icon: <Shield size={14} />, label: 'Version', value: 'OACF v1.0.0', sub: '10-level framework' },
        ].map(({ icon, label, value, sub }) => (
          <div key={label} style={{
            background: '#111113', border: '1px solid #27272a', borderRadius: 12,
            padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center',
          }}>
            <span style={{ color: '#52525b' }}>{icon}</span>
            <div>
              <p style={{ fontSize: 10, color: '#52525b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
              <p style={{ fontSize: 13, color: '#fafafa', fontWeight: 700, margin: '2px 0 0', fontFamily: 'monospace' }}>{value}</p>
              <p style={{ fontSize: 10, color: '#52525b', margin: 0 }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={14} color="#52525b" />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#fafafa', margin: 0 }}>Engine Modifiers</h2>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#52525b' }}>Read-only · Adjusted by Level 10</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0e0e10', borderBottom: '1px solid #1f1f21' }}>
              {['Level', 'Modifier Key', 'Current', 'Base', 'Drift'].map(h => (
                <th key={h} style={{
                  padding: '10px 20px',
                  textAlign: h === 'Current' || h === 'Base' || h === 'Drift' ? 'right' : 'left',
                  fontSize: 9, fontWeight: 600, color: '#3f3f46', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modifiers.map((mod, i) => <ModifierRow key={i} mod={mod} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
