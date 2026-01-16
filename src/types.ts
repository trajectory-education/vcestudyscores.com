export interface ScalingData {
  code: string;
  name: string;
  mean: number;
  stdev: number;
  scaling: { [key: string]: number };
}

export interface AggregateData {
  atar: number;
  aggregate: number;
}

export interface Student {
  name: string;
  school: string;
  subjects: { subject: string; score: number }[];
  year: number;
}