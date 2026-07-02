import { Recap as _Recap } from "@/generated/prisma/client";

export type RecapModel = _Recap;

// The structured payload stored in Recap.data and returned to the client.
export type RecapData = {
  period: "week" | "month";
  from: string;
  to: string;
  title: string;
  evaluation: string;
  counts: { dreams: number; nightmares: number; lucid: number; total: number };
  emotions: { label: string; pct: number }[];
  patterns: { type: "symbol" | "nightmare"; text: string }[];
  recurringSymbols: { name: string; count: number }[];
};
