export type DeliveryPoint = {
  date: string;
  label: string;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveredPct: number;
};

export type ReplyPoint = {
  date: string;
  label: string;
  replies: number;
};

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  definition: string;
};

export type FunnelRates = {
  contactRate: number;
  replyRate: number;
  bookingRate: number;
};

export type FunnelData = {
  stages: FunnelStage[];
  rates: FunnelRates;
  definitions: Record<string, string>;
  meta: { timezone: string; range: string };
};

export type Kpis = {
  leadsNew: number;
  sent: number;
  delivered: number;
  deliveredRate: number; // 0..1
  replies: number;
  deltas: { leadsNew: number; sent: number; deliveredRate: number; replies: number };
};

export type MetricsResponse = {
  range: string;
  kpis: Kpis;
  charts: {
    deliveryOverTime: DeliveryPoint[];
    repliesOverTime: ReplyPoint[];
    timezone: string;
  };
  funnel: FunnelData;
};

