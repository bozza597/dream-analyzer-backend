import { Prisma } from "@/generated/prisma/client";
import { DreamType } from "@/generated/prisma/enums";
import { DBClient } from "@/server/db";
import { DreamEntityModel, DreamModel } from "@/server/models/Dream";

const dreamInclude = {
  entities: true,
  questions: { orderBy: { position: "asc" } },
} satisfies Prisma.DreamInclude;

export class DreamsAdapter {

  constructor(private db: DBClient) { }

  async getById(id: string): Promise<DreamModel | null> {
    return this.db.dream.findFirst({
      where: { id, deletedAt: null },
      include: dreamInclude,
    });
  }

  async listByUser(userId: string, range?: { from?: Date; to?: Date }): Promise<DreamModel[]> {
    return this.db.dream.findMany({
      where: {
        userId,
        deletedAt: null,
        occurredAt: range ? { gte: range.from, lte: range.to } : undefined,
      },
      include: dreamInclude,
      orderBy: { occurredAt: "desc" },
    });
  }

  async insert(data: {
    userId: string;
    type: DreamType;
    title?: string | null;
    content: string;
    emotions?: string[];
    vividness?: number | null;
    occurredAt?: Date;
  }): Promise<DreamModel> {
    return this.db.dream.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        content: data.content,
        emotions: data.emotions ?? [],
        vividness: data.vividness,
        occurredAt: data.occurredAt ?? new Date(),
      },
      include: dreamInclude,
    });
  }

  async updateById(id: string, data: Prisma.DreamUpdateInput): Promise<DreamModel> {
    return this.db.dream.update({
      where: { id },
      data,
      include: dreamInclude,
    });
  }

  async softDelete(id: string): Promise<DreamModel> {
    return this.db.dream.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: dreamInclude,
    });
  }

  // Replaces a dream's analysis output (title, interpretation, summary, symbols, questions) atomically.
  // `title` is omitted (left untouched) when undefined, so an already-set title is never clobbered.
  async replaceAnalysis(id: string, data: {
    title?: string;
    summary: string;
    interpretation: string;
    entities: { key: string; name: string; meaning: string }[];
    questions: string[];
  }): Promise<DreamModel> {
    return this.db.$transaction(async (tx) => {
      await tx.dreamEntity.deleteMany({ where: { dreamId: id } });
      await tx.dreamQuestion.deleteMany({ where: { dreamId: id } });

      return tx.dream.update({
        where: { id },
        data: {
          title: data.title,
          summary: data.summary,
          interpretation: data.interpretation,
          analyzedAt: new Date(),
          entities: {
            create: data.entities.map((e) => ({ key: e.key, name: e.name, meaning: e.meaning })),
          },
          questions: {
            create: data.questions.map((q, position) => ({ question: q, position })),
          },
        },
        include: dreamInclude,
      });
    });
  }

  async answerQuestion(questionId: string, answer: string): Promise<void> {
    await this.db.dreamQuestion.update({
      where: { id: questionId },
      data: { answer },
    });
  }

  // Counts how many of the user's (non-deleted) dreams each entity key appears in.
  async entityCountsByUser(userId: string): Promise<Record<string, number>> {
    const rows = await this.db.dreamEntity.findMany({
      where: { dream: { userId, deletedAt: null } },
      select: { key: true, dreamId: true },
    });

    const seen = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!seen.has(row.key)) seen.set(row.key, new Set());
      seen.get(row.key)!.add(row.dreamId);
    }

    const counts: Record<string, number> = {};
    for (const [key, dreamIds] of seen) counts[key] = dreamIds.size;
    return counts;
  }

  async entitiesByUser(userId: string): Promise<DreamEntityModel[]> {
    return this.db.dreamEntity.findMany({
      where: { dream: { userId, deletedAt: null } },
    });
  }
}
