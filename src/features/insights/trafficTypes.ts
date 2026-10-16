export interface Retention { returned: number; eligible: number; percent: number }
export interface TrafficData {
  generatedAt: number; days: number; country: string; coverageStart: number | null;
  incomplete: boolean; revenueIncomplete: boolean; missingAmount: number;
  limits: { dailyMemberships: number; signups: number; payments: number };
  countries: { code: string; name: string }[];
  series: { day: string; dau: number | null; mau: number | null; mauComplete: boolean }[];
  summary: { users: number; sessions: number; activeMs: number; averageSessionMs: number | null; tokens: number };
  geography: { country: string; users: number; sessions: number; activeMs: number; tokens: number }[];
  devices: { platform: string; sessions: number }[];
  cohorts: { cohort: string; users: number; retention: (Retention | null)[] }[];
  heatmap: number[][];
  revenue: { country: string; currency: string; captured: number; refunded: number }[] | null;
  currencyExponents: Record<string, number>;
}
export function retainedTotal(data: TrafficData, index: number): Retention | null {
  const eligible = data.cohorts.flatMap(c => c.retention[index] ? [c.retention[index]!] : []);
  const count = eligible.reduce((n, c) => n + c.eligible, 0), returned = eligible.reduce((n, c) => n + c.returned, 0);
  return count ? { eligible: count, returned, percent: returned / count * 100 } : null;
}
