import Link from "next/link";

export default function ResearchDashboardPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <h1 className="text-4xl font-black tracking-tight text-white mb-2">Alpha Research Platform</h1>
      <p className="text-slate-400 mb-8 text-lg">Institutional quantitative discovery, validation, and tracking suite.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <DashboardCard 
          title="Winner Genome" 
          desc="Analyze the DNA of actual Top Decile market performers."
          href="/research/genome"
          metric="452 Winners"
        />
        <DashboardCard 
          title="Missed Alpha Archive" 
          desc="Review stocks the model severely undervalued."
          href="/research/missed"
          metric="84 Misses (7d)"
        />
        <DashboardCard 
          title="Pattern Registry" 
          desc="HDBSCAN clusters of non-linear missed alpha."
          href="/research/patterns"
          metric="3 Active Patterns"
        />
        <DashboardCard 
          title="Factor Discovery" 
          desc="Candidate formulas awaiting validation."
          href="/research/factors"
          metric="12 Candidates"
        />
        <DashboardCard 
          title="Validation Funnel" 
          desc="Backtest, Purged CV, and Out-of-Time results."
          href="/research/validation"
          metric="4 In Progress"
        />
        <DashboardCard 
          title="Champion vs Challenger" 
          desc="Shadow model tracking and promotion recommendations."
          href="/research/shadow"
          metric="V4 NDCG +5.2%"
        />
        <DashboardCard 
          title="Alpha Graveyard" 
          desc="Archive of rejected hypotheses and failed models."
          href="/research/graveyard"
          metric="124 Rejected"
        />
        <DashboardCard 
          title="Alpha Decay Engine" 
          desc="Live SHAP drift and IC degradation alerts."
          href="/research/decay"
          metric="2 Alerts"
          alert
        />
        <DashboardCard 
          title="Capacity Intelligence" 
          desc="ADV and market impact deployability metrics."
          href="/research/capacity"
          metric="Avg ₹12Cr Max"
        />
      </div>
    </div>
  );
}

function DashboardCard({ title, desc, href, metric, alert = false }: any) {
  return (
    <Link href={href} className="block group">
      <div className={`p-6 rounded-2xl border transition-all duration-300 h-full flex flex-col justify-between ${alert ? 'bg-red-950/20 border-red-900/50 hover:bg-red-900/30' : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'}`}>
        <div>
          <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{title}</h3>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">{desc}</p>
        </div>
        <div className={`text-sm font-semibold ${alert ? 'text-red-400' : 'text-blue-500'}`}>
          {metric} &rarr;
        </div>
      </div>
    </Link>
  );
}
