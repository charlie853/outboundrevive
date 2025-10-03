export type DayPoint = { d: string; sent: number; delivered: number; failed: number; inbound: number };
export type Kpis = {
  leadsNew: number;
  sent: number;
  delivered: number;
  deliveredRate: number; // 0..1
  replies: number;
  deltas: { leadsNew: number; sent: number; deliveredRate: number; replies: number };
};
export type MetricsResponse = {
  range: '7d' | '30d' | '90d' | string;
  days: DayPoint[];
  kpis: Kpis;
  funnel: { leads: number; sent: number; delivered: number; replied: number };
};

