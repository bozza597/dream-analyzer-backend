import { DreamType, RecapPeriod } from "@/generated/prisma/enums";
import { DreamsAdapter } from "../adapters/db/dreams.adapter";
import { RecapsAdapter } from "../adapters/db/recaps.adapter";
import { DreamModel } from "../models/Dream";
import { RecapData } from "../models/Recap";
import ApplicationError, { ErrorCode } from "../types/ApplicationError";
import { AnalysisService, RecapStats } from "./analysis.service";

export type PeriodKey = "week" | "month";

export type PastRecapEntry = {
  period: PeriodKey;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  total: number;
  generated: boolean;
};

export type RecapOverview = {
  period: PeriodKey;
  current: {
    from: string;
    to: string;
    total: number;
    dreams: number;
    nightmares: number;
    lucid: number;
  };
  past: PastRecapEntry[];
};

const PAST_LIMIT = 24;

export class RecapsService {
  constructor(
    private dreamsAdapter: DreamsAdapter,
    private recapsAdapter: RecapsAdapter,
    private analysisService: AnalysisService
  ) {}

  // Lists the current (in-progress) period plus the finished periods that contain
  // at least one dream. Listing never generates a recap.
  async getOverview(userId: string, period: PeriodKey): Promise<RecapOverview> {
    const enumPeriod = toEnum(period);
    const now = new Date();

    const allDreams = await this.dreamsAdapter.listByUser(userId);

    const currentStart = periodStart(period, now);
    const currentEnd = periodEnd(period, currentStart);
    const currentDreams = allDreams.filter((d) => within(d.occurredAt, currentStart, currentEnd));

    // Distinct finished period-starts that contain dreams.
    const byStart = new Map<number, { start: Date; end: Date; total: number }>();
    for (const dream of allDreams) {
      const start = periodStart(period, dream.occurredAt);
      const end = periodEnd(period, start);
      if (end.getTime() >= now.getTime()) continue; // skip the current/unfinished period
      const key = start.getTime();
      if (!byStart.has(key)) byStart.set(key, { start, end, total: 0 });
      byStart.get(key)!.total += 1;
    }

    const generated = new Set(
      (await this.recapsAdapter.listByUser(userId, enumPeriod)).map((r) => r.periodStart.getTime())
    );

    const past: PastRecapEntry[] = [...byStart.values()]
      .sort((a, b) => b.start.getTime() - a.start.getTime())
      .slice(0, PAST_LIMIT)
      .map((p) => ({
        period,
        periodStart: toDayString(p.start),
        periodEnd: toDayString(p.end),
        total: p.total,
        generated: generated.has(p.start.getTime()),
      }));

    return {
      period,
      current: {
        from: toDayString(currentStart),
        to: toDayString(currentEnd),
        total: currentDreams.length,
        dreams: currentDreams.filter((d) => d.type === DreamType.DREAM).length,
        nightmares: currentDreams.filter((d) => d.type === DreamType.NIGHTMARE).length,
        lucid: currentDreams.filter((d) => d.type === DreamType.LUCID).length,
      },
      past,
    };
  }

  // Returns the saved recap for a finished period, generating and persisting it on
  // first access. Refuses to generate a recap for the current/unfinished period.
  async getEntry(userId: string, period: PeriodKey, startInput: string): Promise<RecapData> {
    const enumPeriod = toEnum(period);
    const parsed = parseDay(startInput);
    if (!parsed) {
      throw new ApplicationError("Data del periodo non valida", ErrorCode.BAD_REQUEST);
    }

    const start = periodStart(period, parsed);
    const end = periodEnd(period, start);
    const now = new Date();

    if (end.getTime() >= now.getTime()) {
      throw new ApplicationError(
        "Il recap è disponibile solo a periodo concluso",
        ErrorCode.BAD_REQUEST
      );
    }

    const existing = await this.recapsAdapter.findByPeriod(userId, enumPeriod, start);
    if (existing) {
      return existing.data as unknown as RecapData;
    }

    const payload = await this.buildRecap(userId, period, start, end);
    await this.recapsAdapter.upsert({
      userId,
      period: enumPeriod,
      periodStart: start,
      periodEnd: end,
      headline: payload.headline,
      payload,
    });

    return payload;
  }

  private async buildRecap(userId: string, period: PeriodKey, from: Date, to: Date): Promise<RecapData> {
    const dreams = await this.dreamsAdapter.listByUser(userId, { from, to });

    const counts = {
      dreams: dreams.filter((d) => d.type === DreamType.DREAM).length,
      nightmares: dreams.filter((d) => d.type === DreamType.NIGHTMARE).length,
      lucid: dreams.filter((d) => d.type === DreamType.LUCID).length,
      total: dreams.length,
    };

    const emotions = topEmotions(dreams);
    const recurringSymbols = recurringSymbols_(dreams);
    const patterns = derivePatterns(dreams, recurringSymbols);

    const stats: RecapStats = {
      period,
      dreams: counts.dreams,
      nightmares: counts.nightmares,
      lucid: counts.lucid,
      topEmotions: emotions,
      recurringSymbols,
    };

    let headline = fallbackHeadline(period, counts);
    if (counts.total > 0) {
      try {
        headline = await this.analysisService.generateRecapHeadline(stats);
      } catch (e) {
        console.error("Recap headline generation failed, using fallback", e);
      }
    }

    return {
      period,
      from: toDayString(from),
      to: toDayString(to),
      headline,
      counts,
      emotions,
      patterns,
      recurringSymbols,
    };
  }
}

const toEnum = (period: PeriodKey): RecapPeriod => (period === "month" ? RecapPeriod.MONTH : RecapPeriod.WEEK);

const toDayString = (date: Date) => date.toISOString().slice(0, 10);

const parseDay = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return isNaN(d.getTime()) ? null : d;
};

const within = (date: Date, from: Date, to: Date) =>
  date.getTime() >= from.getTime() && date.getTime() <= to.getTime();

const periodStart = (period: PeriodKey, ref: Date): Date => {
  if (period === "month") {
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0));
  }
  const day = (ref.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - day, 0, 0, 0));
};

const periodEnd = (period: PeriodKey, start: Date): Date => {
  if (period === "month") {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59));
  }
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59));
};

const topEmotions = (dreams: DreamModel[]): { label: string; pct: number }[] => {
  const counts = new Map<string, number>();
  let total = 0;
  for (const dream of dreams) {
    for (const emotion of dream.emotions) {
      counts.set(emotion, (counts.get(emotion) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([label, n]) => ({ label, pct: Math.round((n / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
};

const recurringSymbols_ = (dreams: DreamModel[]): { name: string; count: number }[] => {
  const byKey = new Map<string, { name: string; dreamIds: Set<string> }>();
  for (const dream of dreams) {
    for (const entity of dream.entities ?? []) {
      if (!byKey.has(entity.key)) byKey.set(entity.key, { name: entity.name, dreamIds: new Set() });
      byKey.get(entity.key)!.dreamIds.add(dream.id);
    }
  }
  return [...byKey.values()]
    .map((v) => ({ name: v.name, count: v.dreamIds.size }))
    .filter((v) => v.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

const derivePatterns = (
  dreams: DreamModel[],
  symbols: { name: string; count: number }[]
): { type: "symbol" | "nightmare"; text: string }[] => {
  const patterns: { type: "symbol" | "nightmare"; text: string }[] = [];

  const topSymbol = symbols.find((s) => s.count >= 2);
  if (topSymbol) {
    patterns.push({ type: "symbol", text: `${topSymbol.name} torna spesso nei tuoi sogni — comparso ${topSymbol.count} volte.` });
  }

  const nightmares = dreams.filter((d) => d.type === DreamType.NIGHTMARE);
  if (nightmares.length >= 2) {
    const weekdayCounts = new Map<number, number>();
    for (const n of nightmares) {
      const wd = n.occurredAt.getUTCDay();
      weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1);
    }
    const [topWd, topCount] = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount >= 2) {
      patterns.push({ type: "nightmare", text: `Gli incubi tendono a comparire di ${WEEKDAYS[topWd]} notte.` });
    }
  }

  return patterns;
};

const fallbackHeadline = (period: PeriodKey, counts: { dreams: number; nightmares: number; total: number }) => {
  const label = period === "week" ? "settimana" : "mese";
  if (counts.total === 0) return `Nessun sogno registrato in questa ${label}.`;
  return `${counts.total} notti raccolte: ${counts.dreams} sogni e ${counts.nightmares} incubi in questa ${label}.`;
};
