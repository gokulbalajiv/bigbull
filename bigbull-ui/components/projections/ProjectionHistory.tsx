'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Calendar, Database } from 'lucide-react';
import { ProjectionTable } from './ProjectionTable';

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function HistoryAccordionItem({
  date, isOpen, onToggle,
}: { date: string; isOpen: boolean; onToggle: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projections', date],
    queryFn: async () => {
      const res = await fetch(`/api/projections?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw json;
      return json;
    },
    enabled: isOpen,
    staleTime: Infinity, // historical data never changes
  });

  const hasData    = Array.isArray(data) && data.length > 0;
  const isMissing  = (error as any)?.error === 'NO_DATA';

  return (
    <div style={{
      background: '#111113', borderRadius: 12,
      border: `1px solid ${isOpen ? '#3f3f46' : '#27272a'}`,
      overflow: 'hidden', transition: 'border-color 0.15s ease',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
          transition: 'background 0.12s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1c')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={13} color="#52525b" />
          <span style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500 }}>{formatDateLabel(date)}</span>
          <span style={{ fontSize: 11, color: '#3f3f46', fontFamily: 'monospace' }}>{date}</span>
        </div>
        <ChevronDown
          size={14} color="#52525b"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        />
      </button>

      {isOpen && (
        <div style={{ borderTop: '1px solid #27272a' }}>
          {isLoading && (
            <div className="shimmer-skeleton" style={{ height: 80, margin: 12, borderRadius: 8 }} />
          )}
          {isMissing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 24px', color: '#3f3f46' }}>
              <Database size={14} />
              <span style={{ fontSize: 12 }}>No stored data for this date</span>
            </div>
          )}
          {hasData && <ProjectionTable data={data} />}
        </div>
      )}
    </div>
  );
}

export function ProjectionHistory({ days }: { days: number }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Fetch list of dates that actually have stored data
  const { data: auditMeta } = useQuery({
    queryKey: ['audit-available'],
    queryFn: () => fetch('/api/audit?date=' + new Date().toISOString().split('T')[0]).then(r => r.json()),
    staleTime: 1000 * 60 * 5,
  });

  const availableDates: string[] = auditMeta?.available_dates ?? [];

  // Show up to `days` past weekdays (skip today)
  const pastWeekdays: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (pastWeekdays.length < days) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      pastWeekdays.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }

  const datesWithData    = pastWeekdays.filter(date => availableDates.includes(date));
  const datesWithoutData = pastWeekdays.filter(date => !availableDates.includes(date));

  return (
    <section>
      <h3 style={{
        fontSize: 11, fontWeight: 600, color: '#52525b',
        letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
      }}>
        Historical Projections — Last {days} Days
      </h3>

      {datesWithData.length === 0 ? (
        <div style={{
          background: '#111113', borderRadius: 12, border: '1px solid #27272a',
          padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <Database size={24} strokeWidth={1.2} color="#27272a" />
          <p style={{ fontSize: 13, color: '#3f3f46', margin: 0 }}>No historical data yet</p>
          <p style={{ fontSize: 11, color: '#27272a', margin: 0, textAlign: 'center' }}>
            Today's projections will appear here from tomorrow onwards.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {datesWithData.map(date => (
            <HistoryAccordionItem
              key={date} date={date}
              isOpen={openDate === date}
              onToggle={() => setOpenDate(openDate === date ? null : date)}
            />
          ))}
          {datesWithoutData.length > 0 && (
            <p style={{ fontSize: 10, color: '#27272a', textAlign: 'center', margin: '4px 0 0', fontFamily: 'monospace' }}>
              + {datesWithoutData.length} day{datesWithoutData.length !== 1 ? 's' : ''} without stored data (before recording began)
            </p>
          )}
        </div>
      )}
    </section>
  );
}
