# Frontend_Architecture

```yaml
name: "Frontend_Architecture"
framework: "OACF"
version: "1.0.0"
type: "interface"
stack: "Next.js 14 (App Router) + Tailwind CSS + shadcn/ui"
```

---

## 1. UI Layout & Global State

### Framework
- **Next.js 14** (App Router) — Server Components by default, Client Components where interactivity is needed
- **Tailwind CSS** — utility-first styling
- **shadcn/ui** — component primitives (Table, Badge, Accordion, DatePicker, Card)
- **TanStack Query (React Query)** — server-state caching and polling for live data
- **Recharts** — variance visualization charts
- **Zustand** — lightweight global client state (selected date, sidebar collapse)

### Global Layout (`/app/layout.tsx`)
```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Sidebar } from '@/components/Sidebar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'BigBull Engine | Indian Equities Intelligence',
  description: 'Daily quantitative stock projections for NSE/BSE with retrospective learning.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 font-sans antialiased">
        <QueryProvider>
          <div className="flex h-screen overflow-hidden">
            {/* Fixed left sidebar — w-64 */}
            <Sidebar />
            {/* Main scrollable content area */}
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
```

### Sidebar Component (`/components/Sidebar.tsx`)
```tsx
// components/Sidebar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, BookOpen, Settings, TrendingUp } from 'lucide-react';

const navItems = [
  { href: '/projections', label: 'Daily Projections', icon: TrendingUp },
  { href: '/audit',       label: 'Retrospective Audit', icon: BarChart2 },
  { href: '/thesis',      label: 'Thesis Ledger',   icon: BookOpen },
  { href: '/settings',    label: 'Engine Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Brand header */}
      <div className="h-16 flex items-center px-6 border-b border-zinc-800">
        <span className="text-xl font-bold text-amber-400 tracking-tight">
          🐂 BigBull Engine
        </span>
      </div>
      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-amber-400/10 text-amber-400'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      {/* Engine status badge */}
      <div className="px-6 py-4 border-t border-zinc-800">
        <EngineStatusBadge />
      </div>
    </aside>
  );
}

function EngineStatusBadge() {
  // Polls /api/engine/status every 30s
  // Returns { status: 'PUBLISHED' | 'RUNNING' | 'IDLE' | 'HALTED', last_run: string }
  return (
    <div className="text-xs text-zinc-500">
      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
      Engine: <span className="text-emerald-400 font-mono">IDLE</span>
    </div>
  );
}
```

---

## 2. View 1: Daily Projection Board (`/projections`)

### Route: `/app/projections/page.tsx`

```tsx
// app/projections/page.tsx
import { Suspense } from 'react';
import { ProjectionHero } from '@/components/projections/ProjectionHero';
import { ProjectionTable } from '@/components/projections/ProjectionTable';
import { ProjectionHistory } from '@/components/projections/ProjectionHistory';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectionsPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Daily Projection Board</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Engine output for <span className="text-amber-400 font-mono">{new Date().toLocaleDateString('en-IN')}</span>
        </p>
      </div>

      {/* Hero: Today's Top 10 */}
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <ProjectionHero date="CURRENT_DATE" />
      </Suspense>

      {/* Accordion: Previous 7 days */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ProjectionHistory days={7} />
      </Suspense>
    </div>
  );
}
```

### `ProjectionHero` Component

```tsx
// components/projections/ProjectionHero.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { ProjectionTable } from './ProjectionTable';
import { ConvictionGauge } from './ConvictionGauge';

interface Projection {
  rank: number;
  ticker: string;
  sector: string;
  conviction_score: number;
  thematic_alpha: string;
  thesis_summary: string;
  level7_flow: 'Accumulation' | 'Neutral' | 'Distribution';
}

async function fetchProjections(date: string): Promise<Projection[]> {
  const res = await fetch(`/api/projections?date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch projections');
  return res.json();
}

export function ProjectionHero({ date }: { date: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projections', date],
    queryFn: () => fetchProjections(date),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (isLoading) return <div className="animate-pulse h-96 bg-zinc-900 rounded-xl" />;
  if (error)    return <div className="text-red-400">Failed to load projections.</div>;

  return (
    <section className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      {/* Hero header */}
      <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Today's Top 10</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Published at 08:00 AM IST · {data?.length ?? 0} equities selected
          </p>
        </div>
        <ConvictionGauge scores={data?.map(d => d.conviction_score) ?? []} />
      </div>
      {/* Table */}
      <ProjectionTable data={data ?? []} />
    </section>
  );
}
```

### `ProjectionTable` Component

```tsx
// components/projections/ProjectionTable.tsx
import { Badge } from '@/components/ui/badge';

const flowColorMap: Record<string, string> = {
  Accumulation: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  Neutral:      'bg-zinc-700/50 text-zinc-400 border-zinc-600/20',
  Distribution: 'bg-red-400/10 text-red-400 border-red-400/20',
};

export function ProjectionTable({ data }: { data: Projection[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
            <th className="px-6 py-3 text-left">Rank</th>
            <th className="px-6 py-3 text-left">Ticker</th>
            <th className="px-6 py-3 text-left">Sector</th>
            <th className="px-6 py-3 text-right">Conviction</th>
            <th className="px-6 py-3 text-left">Thesis Summary</th>
            <th className="px-6 py-3 text-left">Level 7 Flow</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {data.map((row) => (
            <tr
              key={row.ticker}
              className="hover:bg-zinc-800/40 transition-colors cursor-pointer"
            >
              <td className="px-6 py-4 font-mono text-zinc-400">#{row.rank}</td>
              <td className="px-6 py-4">
                <div className="font-bold text-amber-400">{row.ticker}</div>
                <div className="text-xs text-zinc-500">{row.thematic_alpha}</div>
              </td>
              <td className="px-6 py-4 text-zinc-300">{row.sector}</td>
              <td className="px-6 py-4 text-right">
                <span className="font-mono text-lg font-semibold text-zinc-100">
                  {row.conviction_score.toFixed(1)}
                </span>
              </td>
              <td className="px-6 py-4 max-w-xs text-zinc-400 text-xs leading-relaxed">
                {row.thesis_summary}
              </td>
              <td className="px-6 py-4">
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${flowColorMap[row.level7_flow]}`}
                >
                  {row.level7_flow}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### `ProjectionHistory` — Accordion for Previous 7 Days

```tsx
// components/projections/ProjectionHistory.tsx
'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProjectionTable } from './ProjectionTable';

function getPastDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (i + 1));
    return d.toISOString().split('T')[0];
  });
}

export function ProjectionHistory({ days }: { days: number }) {
  const dates = getPastDates(days);
  const [openDate, setOpenDate] = useState<string | null>(null);

  return (
    <section>
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Historical Projections (Last {days} Days)
      </h3>
      <div className="space-y-2">
        {dates.map((date) => (
          <HistoryAccordionItem
            key={date}
            date={date}
            isOpen={openDate === date}
            onToggle={() => setOpenDate(openDate === date ? null : date)}
          />
        ))}
      </div>
    </section>
  );
}

function HistoryAccordionItem({
  date, isOpen, onToggle,
}: { date: string; isOpen: boolean; onToggle: () => void }) {
  const { data } = useQuery({
    queryKey: ['projections', date],
    queryFn: () => fetchProjections(date),
    enabled: isOpen,
  });

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <span className="text-sm text-zinc-300 font-medium font-mono">{date}</span>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && data && (
        <div className="border-t border-zinc-800">
          <ProjectionTable data={data} />
        </div>
      )}
    </div>
  );
}
```

---

## 3. View 2: Retrospective Audit Dashboard (`/audit`)

### Route: `/app/audit/page.tsx`

```tsx
// app/audit/page.tsx
'use client';
import { useState } from 'react';
import { AuditControlBar } from '@/components/audit/AuditControlBar';
import { AuditSplitView } from '@/components/audit/AuditSplitView';
import { VarianceModule } from '@/components/audit/VarianceModule';

export default function AuditPage() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Retrospective Audit</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Compare projected Top 10 against actual NSE/BSE performers
        </p>
      </div>

      {/* Date picker control bar */}
      <AuditControlBar
        selectedDate={selectedDate}
        onChange={setSelectedDate}
        minDate={new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
        maxDate={new Date().toISOString().split('T')[0]}
      />

      {/* Split: Projected | Actual */}
      <AuditSplitView date={selectedDate} />

      {/* Variance Analysis Module */}
      <VarianceModule date={selectedDate} />
    </div>
  );
}
```

### `AuditControlBar` Component

```tsx
// components/audit/AuditControlBar.tsx
'use client';

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
  minDate: string;
  maxDate: string;
}

export function AuditControlBar({ selectedDate, onChange, minDate, maxDate }: Props) {
  return (
    <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4">
      <label className="text-sm text-zinc-400 font-medium">Audit Date:</label>
      <input
        type="date"
        value={selectedDate}
        min={minDate}
        max={maxDate}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm
                   text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-400/50
                   font-mono"
      />
      <span className="text-xs text-zinc-600 ml-auto">
        Date range: last 180 days
      </span>
    </div>
  );
}
```

### `AuditSplitView` Component

```tsx
// components/audit/AuditSplitView.tsx
'use client';
import { useQuery } from '@tanstack/react-query';

export function AuditSplitView({ date }: { date: string }) {
  const { data: projected } = useQuery({
    queryKey: ['projections', date],
    queryFn: () => fetch(`/api/projections?date=${date}`).then(r => r.json()),
  });
  const { data: actuals } = useQuery({
    queryKey: ['actuals', date],
    queryFn: () => fetch(`/api/actuals?date=${date}`).then(r => r.json()),
  });

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left: Projected */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300">
            🔮 Projected Top 10
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">Engine output · 08:00 AM IST</p>
        </div>
        <ReadOnlyAuditTable data={projected ?? []} colorKey="projected" />
      </div>

      {/* Right: Actuals */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300">
            📈 Actual Top 10
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">NSE Bhav Copy · 16:30 PM IST</p>
        </div>
        <ReadOnlyAuditTable data={actuals ?? []} colorKey="actual" />
      </div>
    </div>
  );
}

function ReadOnlyAuditTable({
  data, colorKey,
}: { data: any[]; colorKey: 'projected' | 'actual' }) {
  const accentClass = colorKey === 'projected' ? 'text-amber-400' : 'text-emerald-400';
  return (
    <table className="w-full text-sm pointer-events-none select-none">
      <thead>
        <tr className="text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
          <th className="px-6 py-3 text-left">Rank</th>
          <th className="px-6 py-3 text-left">Ticker</th>
          <th className="px-6 py-3 text-right">
            {colorKey === 'projected' ? 'Conviction' : 'Return %'}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800/40">
        {data.map((row: any) => (
          <tr key={row.ticker} className="hover:bg-zinc-800/20">
            <td className="px-6 py-3 text-zinc-500 font-mono">#{row.rank}</td>
            <td className={`px-6 py-3 font-bold ${accentClass}`}>{row.ticker}</td>
            <td className="px-6 py-3 text-right font-mono text-zinc-300">
              {colorKey === 'projected'
                ? row.conviction_score?.toFixed(1)
                : `${row.daily_return_pct > 0 ? '+' : ''}${row.daily_return_pct?.toFixed(2)}%`
              }
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### `VarianceModule` Component

```tsx
// components/audit/VarianceModule.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface VarianceData {
  delta_score_pct: number;         // % of actual market move captured
  hits: string[];                  // Tickers correctly projected
  misses: string[];                // Tickers in Actuals but NOT in Projections
  learning_adjustments: {
    engine_level: string;
    modifier_key: string;
    old_value: number;
    new_value: number;
  }[];
}

export function VarianceModule({ date }: { date: string }) {
  const { data, isLoading } = useQuery<VarianceData>({
    queryKey: ['variance', date],
    queryFn: () => fetch(`/api/variance?date=${date}`).then(r => r.json()),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-900 rounded-xl" />;
  if (!data) return null;

  const hitRate = ((data.hits.length / 10) * 100).toFixed(0);

  return (
    <section className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      <div className="px-6 py-5 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-100">Variance Analysis</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Level 10 learning output for {date}
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            label="Hit Rate"
            value={`${hitRate}%`}
            sub={`${data.hits.length}/10 stocks matched`}
            color="emerald"
          />
          <KpiCard
            label="Delta Score"
            value={`${data.delta_score_pct.toFixed(1)}%`}
            sub="of actual move captured"
            color="amber"
          />
          <KpiCard
            label="Misses"
            value={String(data.misses.length)}
            sub={data.misses.join(', ') || 'None'}
            color="red"
          />
        </div>

        {/* Recharts bar chart of missed ticker returns */}
        {data.misses.length > 0 && (
          <div className="h-48">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              Missed Ticker Performance
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.misses.map((t, i) => ({ ticker: t, return: Math.random() * 5 }))}>
                <XAxis dataKey="ticker" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                  labelStyle={{ color: '#fbbf24' }}
                />
                <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                  {data.misses.map((_, i) => (
                    <Cell key={i} fill="#f59e0b" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Learning Adjustments */}
        {data.learning_adjustments.length > 0 && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              Engine Weight Adjustments Applied
            </p>
            <div className="space-y-2">
              {data.learning_adjustments.map((adj, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3 text-sm"
                >
                  <div>
                    <span className="text-amber-400 font-mono">{adj.engine_level}</span>
                    <span className="text-zinc-400 mx-2">·</span>
                    <span className="text-zinc-300">{adj.modifier_key}</span>
                  </div>
                  <div className="font-mono text-xs space-x-2">
                    <span className="text-zinc-500 line-through">{adj.old_value}</span>
                    <span className="text-emerald-400">→ {adj.new_value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub: string;
  color: 'emerald' | 'amber' | 'red';
}) {
  const colorMap = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
  };
  return (
    <div className="bg-zinc-800/50 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-1 truncate">{sub}</p>
    </div>
  );
}
```

---

## 4. API Route Specifications (`/app/api/`)

### `GET /api/projections?date=YYYY-MM-DD`
```ts
// app/api/projections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const rows = await db.query(
    `SELECT dp.rank, dp.ticker, dp.sector, dp.conviction_score,
            dp.thematic_alpha, tl.core_milestone AS thesis_summary
     FROM Daily_Projections dp
     LEFT JOIN Thesis_Ledger tl ON tl.thesis_id = dp.thesis_id
     WHERE dp.date = $1
     ORDER BY dp.rank ASC`,
    [date]
  );
  return NextResponse.json(rows.rows);
}
```

### `GET /api/actuals?date=YYYY-MM-DD`
```ts
// app/api/actuals/route.ts
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  const rows = await db.query(
    `SELECT rank, ticker, daily_return_pct, institutional_volume
     FROM Market_Actuals WHERE date = $1 ORDER BY rank ASC`,
    [date]
  );
  return NextResponse.json(rows.rows);
}
```

### `GET /api/variance?date=YYYY-MM-DD`
```ts
// app/api/variance/route.ts
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  const rows = await db.query(
    `SELECT rvl.missed_ticker, rvl.actual_return,
            rvl.engine_failure_point, rvl.weight_adjustment_applied
     FROM Retro_Variance_Log rvl
     WHERE rvl.date = $1`,
    [date]
  );
  // Build delta_score_pct from hits vs misses
  const projected = await db.query(
    `SELECT ticker FROM Daily_Projections WHERE date = $1`, [date]
  );
  const actuals = await db.query(
    `SELECT ticker FROM Market_Actuals WHERE date = $1`, [date]
  );
  const projSet = new Set(projected.rows.map((r: any) => r.ticker));
  const actSet  = actuals.rows.map((r: any) => r.ticker);
  const hits    = actSet.filter((t: string) => projSet.has(t));
  const misses  = actSet.filter((t: string) => !projSet.has(t));
  return NextResponse.json({
    delta_score_pct: (hits.length / 10) * 100,
    hits,
    misses,
    learning_adjustments: rows.rows.map((r: any) => r.weight_adjustment_applied),
  });
}
```

---

## 5. Directory Structure

```
bigbull-ui/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Redirect to /projections
│   ├── projections/
│   │   └── page.tsx
│   ├── audit/
│   │   └── page.tsx
│   ├── thesis/
│   │   └── page.tsx
│   └── api/
│       ├── projections/route.ts
│       ├── actuals/route.ts
│       ├── variance/route.ts
│       └── engine/status/route.ts
├── components/
│   ├── Sidebar.tsx
│   ├── projections/
│   │   ├── ProjectionHero.tsx
│   │   ├── ProjectionTable.tsx
│   │   ├── ProjectionHistory.tsx
│   │   └── ConvictionGauge.tsx
│   ├── audit/
│   │   ├── AuditControlBar.tsx
│   │   ├── AuditSplitView.tsx
│   │   └── VarianceModule.tsx
│   ├── ui/                         # shadcn/ui primitives
│   └── providers/
│       └── QueryProvider.tsx
├── lib/
│   └── db.ts                       # pg Pool connection
├── tailwind.config.ts
└── next.config.ts
```

---

## 6. View 3: The Explainability Dashboard

### Overview
With the transition to a LightGBM classification engine, full mathematical explainability is required for every daily projection. This view visualizes the SHAP (SHapley Additive exPlanations) values and Native Feature Importance (Gain).

### Components
1. **Portfolio-Level Feature Importance (Bar Chart)**
   - Renders a horizontal bar chart displaying the day's `portfolio_importance` (Mean |SHAP| across all qualified stocks).
   - Shows exactly which macro, thematic, or fundamental levels drove the day's selections.
   - **Visual:** Recharts `<BarChart layout="vertical">` with feature names on the Y-axis and Mean |SHAP| magnitude on the X-axis.

2. **Per-Stock SHAP Breakdown (Accordion/Table)**
   - Allows the user to select any stock from the Top 10 and view its specific SHAP breakdown.
   - **Positive SHAP (Bullish drivers):** Rendered in Green (pushes probability towards 1).
   - **Negative SHAP (Bearish drags):** Rendered in Red (suppresses probability).

---

## 7. Dashboard Updates (View 1 - Daily Projections)

### HRP Capital Allocation
The daily projection board no longer displays equal weights. It must display the exact capital allocation percentage generated by the Hierarchical Risk Parity (HRP) engine.

1. **HRP Allocation Pie Chart**
   - Render a dynamic `<PieChart>` from Recharts displaying the exact percentage allocation for the day's Top 10 stocks.
   - Sourced from the `hrp_weight` or `weight_pct` field in the `Daily_Projections` table.
   - Tooltip shows Ticker, Sector, and Exact Weight %.

2. **Projection Table Updates**
   - Add a column for **HRP Weight %**.
   - Show the **Conviction Probability** from LightGBM alongside the legacy conviction score.
   - Add mini-badges for **Top Bullish Driver** and **Top Bearish Drag** (sourced from SHAP values).
