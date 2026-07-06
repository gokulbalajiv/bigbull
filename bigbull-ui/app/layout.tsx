import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { QueryProvider } from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'BigBull Engine | Indian Equities Intelligence',
  description: 'Daily quantitative stock projections for NSE/BSE with retrospective learning.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <QueryProvider>
          <div className="flex flex-col h-screen" style={{ background: '#09090b' }}>
            {/* Disclaimer banner */}
            <div style={{
              background: 'linear-gradient(90deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
              borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '14px' }}>⚠️</span>
              <p style={{
                color: '#fbbf24',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.01em',
                margin: 0,
                textAlign: 'center',
              }}>
                <strong>Disclaimer:</strong> This is a hobby project. Do not use this for your financial decisions.
              </p>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-6" style={{ background: '#09090b' }}>
                {children}
              </main>
            </div>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
