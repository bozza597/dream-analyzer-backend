import { DreamType } from "@/generated/prisma/enums";
import { DreamsAdapter } from "../adapters/db/dreams.adapter";
import { DreamModel } from "../models/Dream";
import ApplicationError, { ErrorCode } from "../types/ApplicationError";
import { AnalysisService } from "./analysis.service";

export type CreateDreamInput = {
  type?: DreamType;
  title?: string | null;
  content: string;
  emotions?: string[];
  vividness?: number | null;
  occurredAt?: Date;
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
}

const toDayString = (date: Date) => date.toISOString().slice(0, 10);
