import { NextResponse } from 'next/server';
import { getMarketStatus } from '@/lib/marketUtils';

export async function GET() {
  const status = getMarketStatus();
  return NextResponse.json({
    status: status.isWeekend ? 'HALTED' : status.session === 'open' ? 'RUNNING' : 'IDLE',
    last_run: new Date().toISOString(),
    session: status.session,
    isWeekend: status.isWeekend,
    currentDate: status.currentDate,
    istTime: status.istTime,
    equities_scanned: 30,
    next_run: status.isWeekend ? 'Monday 08:00 AM IST' : '08:00 AM IST',
  });
}
