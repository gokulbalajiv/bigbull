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
          <div className="flex h-screen overflow-hidden" style={{ background: '#09090b' }}>
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6" style={{ background: '#09090b' }}>
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
