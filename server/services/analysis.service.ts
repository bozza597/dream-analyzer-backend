import Anthropic from "@anthropic-ai/sdk";
import { DreamType } from "@/generated/prisma/enums";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";

const MODEL = "claude-opus-4-8";

export type AnalysisInput = {
  type: DreamType;
  content: string;
  emotions?: string[];
  vividness?: number | null;
  // Previously asked questions and the user's answers, used to refine the reading.
  answers?: { question: string; answer: string }[];
};

export type AnalysisResult = {
  summary: string;
  interpretation: string;
  entities: { name: string; meaning: string }[];
  questions: string[];
};

export type RecapStats = {
  period: "week" | "month";
  dreams: number;
  nightmares: number;
  lucid: number;
  topEmotions: { label: string; pct: number }[];
  recurringSymbols: { name: string; count: number }[];
};

const TYPE_LABEL: Record<DreamType, string> = {
  DREAM: "sogno",
  NIGHTMARE: "incubo",
  LUCID: "sogno lucido",
};

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "Una frase breve e poetica (massimo 25 parole) che cattura il senso del sogno.",
    },
    interpretation: {
      type: "string",
      description: "2-4 frasi che interpretano il sogno con tono caldo ed empatico, in italiano.",
    },
    entities: {
      type: "array",
      description: "I simboli o entità principali del sogno (da 2 a 6).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Nome breve del simbolo, es. 'Acqua', 'Volo', 'Porta chiusa'." },
          meaning: { type: "string", description: "Significato sintetico del simbolo (1-2 frasi) calato nel contesto del sogno." },
        },
        required: ["name", "meaning"],
      },
    },
    questions: {
      type: "array",
      description: "Da 1 a 3 domande di approfondimento, gentili e mirate, per affinare l'interpretazione.",
      items: { type: "string" },
    },
  },
  required: ["summary", "interpretation", "entities", "questions"],
} as const;

export class AnalysisService {
  private client: Anthropic | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      throw new ApplicationError(
        "Analisi non disponibile: ANTHROPIC_API_KEY non configurata",
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    return this.client;
  }

  async analyzeDream(input: AnalysisInput): Promise<AnalysisResult> {
    const client = this.getClient();

    const typeLabel = TYPE_LABEL[input.type];
    const parts: string[] = [`Tipo: ${typeLabel}.`, `Racconto del sogno:\n"""${input.content}"""`];

    if (input.emotions?.length) {
      parts.push(`Emozioni provate: ${input.emotions.join(", ")}.`);
    }
    if (typeof input.vividness === "number") {
      parts.push(`Vividezza (0-100): ${input.vividness}.`);
    }
    if (input.answers?.length) {
      const qa = input.answers
        .filter((a) => a.answer?.trim())
        .map((a) => `- D: ${a.question}\n  R: ${a.answer}`)
        .join("\n");
      if (qa) parts.push(`Approfondimenti dati dal sognatore:\n${qa}`);
    }

    const system = [
      "Sei un interprete di sogni gentile, poetico ed empatico, ispirato alla psicologia del profondo (junghiana) ma mai clinico o diagnostico.",
      "Scrivi sempre in italiano, con un tono caldo e onirico, in seconda persona.",
      "Non dai diagnosi mediche né consigli medici. Eviti toni allarmistici, anche per gli incubi: per un incubo accogli la paura con delicatezza e cerchi il messaggio protettivo del sogno.",
      "Estrai i simboli concreti realmente presenti nel racconto e dai a ciascuno un significato calato nel contesto, non generico.",
      "Le domande di approfondimento sono brevi, aperte e rispettose: aiutano a esplorare, non a giudicare.",
    ].join(" ");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      output_config: { format: { type: "json_schema", schema: analysisSchema } },
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });

    return this.parseResult(response);
  }

  // Short narrative headline for the weekly / monthly recap. Best-effort: callers
  // should fall back to a computed string if this throws.
  async generateRecapHeadline(stats: RecapStats): Promise<string> {
    const client = this.getClient();

    const periodLabel = stats.period === "week" ? "settimana" : "mese";
    const symbols = stats.recurringSymbols.slice(0, 3).map((s) => `${s.name} (${s.count}×)`).join(", ");
    const emotions = stats.topEmotions.slice(0, 3).map((e) => `${e.label} ${e.pct}%`).join(", ");

    const summarySchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: {
          type: "string",
          description: "Un titolo narrativo (1-2 frasi, max 30 parole) che riassume con calore l'andamento onirico del periodo.",
        },
      },
      required: ["headline"],
    } as const;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "Sei un narratore gentile che riassume l'andamento onirico di una persona in italiano, con tono caldo e poetico. Niente diagnosi.",
      output_config: { format: { type: "json_schema", schema: summarySchema } },
      messages: [
        {
          role: "user",
          content:
            `Periodo: ultima ${periodLabel}.\n` +
            `Sogni: ${stats.dreams}, incubi: ${stats.nightmares}, sogni lucidi: ${stats.lucid}.\n` +
            (emotions ? `Emozioni prevalenti: ${emotions}.\n` : "") +
            (symbols ? `Simboli ricorrenti: ${symbols}.\n` : "") +
            `Scrivi un titolo narrativo per questo recap.`,
        },
      ],
    });

    const parsed = this.parseJson<{ headline: string }>(response);
    return parsed.headline;
  }

  private parseResult(response: Anthropic.Message): AnalysisResult {
    const parsed = this.parseJson<AnalysisResult>(response);
    return {
      summary: parsed.summary ?? "",
      interpretation: parsed.interpretation ?? "",
      entities: Array.isArray(parsed.entities) ? parsed.entities.filter((e) => e?.name && e?.meaning) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter(Boolean) : [],
    };
  }

  private parseJson<T>(response: Anthropic.Message): T {
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      throw new ApplicationError("Risposta dell'analizzatore vuota", ErrorCode.INTERNAL_SERVER_ERROR);
    }
    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      throw new ApplicationError("Risposta dell'analizzatore non valida", ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
}
