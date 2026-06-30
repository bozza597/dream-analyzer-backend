import { DreamType } from "@/generated/prisma/enums";
import { DreamsAdapter } from "../adapters/db/dreams.adapter";
import { DreamModel } from "../models/Dream";
import ApplicationError, { ErrorCode } from "../types/ApplicationError";
import { AnalysisService, RecapStats } from "./analysis.service";

export type CreateDreamInput = {
  type?: DreamType;
  title?: string | null;
  content: string;
  emotions?: string[];
  vividness?: number | null;
  occurredAt?: Date;
};

export type RecapResult = {
  period: "week" | "month";
  from: string;
  to: string;
  headline: string;
  counts: { dreams: number; nightmares: number; lucid: number; total: number };
  emotions: { label: string; pct: number }[];
  patterns: { type: "symbol" | "nightmare"; text: string }[];
  recurringSymbols: { name: string; count: number }[];
};

export type CalendarDay = {
  date: string;
  types: DreamType[];
  dreamIds: string[];
};

const normaliseKey = (name: string) => name.trim().toLowerCase();

export class DreamsService {
  constructor(
    private dreamsAdapter: DreamsAdapter,
    private analysisService: AnalysisService
  ) {}

  async getById(userId: string, id: string): Promise<DreamModel> {
    const dream = await this.dreamsAdapter.getById(id);
    if (!dream || dream.userId !== userId) {
      throw new ApplicationError("Sogno non trovato", ErrorCode.NOT_FOUND_ERROR);
    }
    return dream;
  }

  async list(userId: string, range?: { from?: Date; to?: Date }): Promise<DreamModel[]> {
    return this.dreamsAdapter.listByUser(userId, range);
  }

  async create(userId: string, input: CreateDreamInput): Promise<DreamModel> {
    if (!input.content?.trim()) {
      throw new ApplicationError("Il racconto del sogno è obbligatorio", ErrorCode.BAD_REQUEST);
    }
    return this.dreamsAdapter.insert({
      userId,
      type: input.type ?? DreamType.DREAM,
      title: input.title,
      content: input.content.trim(),
      emotions: input.emotions,
      vividness: input.vividness,
      occurredAt: input.occurredAt,
    });
  }

  async update(userId: string, id: string, input: CreateDreamInput): Promise<DreamModel> {
    await this.getById(userId, id);
    return this.dreamsAdapter.updateById(id, {
      type: input.type,
      title: input.title,
      content: input.content?.trim(),
      emotions: input.emotions,
      vividness: input.vividness,
      occurredAt: input.occurredAt,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.getById(userId, id);
    await this.dreamsAdapter.softDelete(id);
  }

  // Runs the AI analyzer for a dream and persists the interpretation, symbols and questions.
  async analyze(userId: string, id: string): Promise<DreamModel> {
    const dream = await this.getById(userId, id);

    const answers = (dream.questions ?? [])
      .filter((q) => q.answer)
      .map((q) => ({ question: q.question, answer: q.answer as string }));

    const result = await this.analysisService.analyzeDream({
      type: dream.type,
      content: dream.content,
      emotions: dream.emotions,
      vividness: dream.vividness,
      answers,
    });

    return this.dreamsAdapter.replaceAnalysis(id, {
      summary: result.summary,
      interpretation: result.interpretation,
      entities: result.entities.map((e) => ({ key: normaliseKey(e.name), name: e.name, meaning: e.meaning })),
      questions: result.questions,
    });
  }

  // Records answers to follow-up questions, then re-runs the analysis to deepen it.
  async answerAndRefine(
    userId: string,
    id: string,
    answers: { questionId: string; answer: string }[]
  ): Promise<DreamModel> {
    const dream = await this.getById(userId, id);
    const questionIds = new Set((dream.questions ?? []).map((q) => q.id));

    for (const a of answers) {
      if (a.answer?.trim() && questionIds.has(a.questionId)) {
        await this.dreamsAdapter.answerQuestion(a.questionId, a.answer.trim());
      }
    }

    return this.analyze(userId, id);
  }

  // Attaches a per-user recurrence count to each entity of a dream.
  async getWithRecurrence(userId: string, id: string) {
    const dream = await this.getById(userId, id);
    const counts = await this.dreamsAdapter.entityCountsByUser(userId);
    return {
      ...dream,
      entities: (dream.entities ?? []).map((e) => ({ ...e, recurrence: counts[e.key] ?? 1 })),
    };
  }

  async getCalendar(userId: string, range: { from: Date; to: Date }): Promise<CalendarDay[]> {
    const dreams = await this.dreamsAdapter.listByUser(userId, range);
    const byDay = new Map<string, CalendarDay>();

    for (const dream of dreams) {
      const date = toDayString(dream.occurredAt);
      if (!byDay.has(date)) byDay.set(date, { date, types: [], dreamIds: [] });
      const day = byDay.get(date)!;
      if (!day.types.includes(dream.type)) day.types.push(dream.type);
      day.dreamIds.push(dream.id);
    }

    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRecap(userId: string, period: "week" | "month", reference: Date): Promise<RecapResult> {
    const { from, to } = period === "week" ? weekRange(reference) : monthRange(reference);
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

const toDayString = (date: Date) => date.toISOString().slice(0, 10);

const weekRange = (ref: Date) => {
  const d = new Date(ref);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day, 0, 0, 0));
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 6, 23, 59, 59));
  return { from, to };
};

const monthRange = (ref: Date) => {
  const from = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0));
  const to = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59));
  return { from, to };
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

const fallbackHeadline = (period: "week" | "month", counts: { dreams: number; nightmares: number; total: number }) => {
  const label = period === "week" ? "settimana" : "mese";
  if (counts.total === 0) return `Nessun sogno registrato in questa ${label}.`;
  return `${counts.total} notti raccolte: ${counts.dreams} sogni e ${counts.nightmares} incubi in questa ${label}.`;
};
