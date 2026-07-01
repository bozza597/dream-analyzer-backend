import { Prisma } from "@/generated/prisma/client";
import { RecapPeriod } from "@/generated/prisma/enums";
import { DBClient } from "@/server/db";
import { RecapData, RecapModel } from "@/server/models/Recap";

export class RecapsAdapter {
  constructor(private db: DBClient) {}

  async findByPeriod(userId: string, period: RecapPeriod, periodStart: Date): Promise<RecapModel | null> {
    return this.db.recap.findUnique({
      where: { userId_period_periodStart: { userId, period, periodStart } },
    });
  }

  async listByUser(userId: string, period: RecapPeriod): Promise<RecapModel[]> {
    return this.db.recap.findMany({
      where: { userId, period },
      orderBy: { periodStart: "desc" },
    });
  }

  async upsert(data: {
    userId: string;
    period: RecapPeriod;
    periodStart: Date;
    periodEnd: Date;
    headline: string;
    payload: RecapData;
  }): Promise<RecapModel> {
    const json = data.payload as unknown as Prisma.InputJsonValue;
    return this.db.recap.upsert({
      where: { userId_period_periodStart: { userId: data.userId, period: data.period, periodStart: data.periodStart } },
      update: { headline: data.headline, data: json, periodEnd: data.periodEnd, generatedAt: new Date() },
      create: {
        userId: data.userId,
        period: data.period,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        headline: data.headline,
        data: json,
      },
    });
  }
}
