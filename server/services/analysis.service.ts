import OpenAI from "openai";
import { DreamType } from "@/generated/prisma/enums";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";

// A small, low-cost OpenAI model with structured-output (json_schema) support.
const MODEL = "gpt-4o-mini";

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

// JSON schema for the analyzer output (OpenAI strict structured outputs).
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
};

const recapSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description: "Un titolo narrativo (1-2 frasi, max 30 parole) che riassume con calore l'andamento onirico del periodo.",
    },
  },
  required: ["headline"],
};

export class AnalysisService {
  private client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      throw new ApplicationError(
        "Analisi non disponibile: OPENAI_API_KEY non configurata",
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }
    return this.client;
  }

  // Wraps an OpenAI call with logging: operation, model, duration, token usage, outcome.
  private async call(
    operation: string,
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const client = this.getClient();
    const start = Date.now();
    console.log(`>>> [OpenAI] ${operation} | model=${params.model}`);
    try {
      const completion = await client.chat.completions.create(params);
      const ms = Date.now() - start;
      const u = completion.usage;
      const tokens = u
        ? ` | tokens: prompt=${u.prompt_tokens} completion=${u.completion_tokens} total=${u.total_tokens}`
        : "";
      console.log(
        `<<< [OpenAI] ${operation} | model=${params.model} | ${ms}ms` +
          tokens +
          ` | finish=${completion.choices[0]?.finish_reason}`
      );
      return completion;
    } catch (e) {
      const ms = Date.now() - start;
      console.error(`!!! [OpenAI] ${operation} FAILED | model=${params.model} | ${ms}ms`, e);
      throw e;
    }
  }

  async analyzeDream(input: AnalysisInput): Promise<AnalysisResult> {
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

    const completion = await this.call("analyzeDream", {
      model: MODEL,
      max_tokens: 1500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: parts.join("\n\n") },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "dream_analysis", strict: true, schema: analysisSchema },
      },
    });

    const parsed = this.parseJson<AnalysisResult>(completion);
    return {
      summary: parsed.summary ?? "",
      interpretation: parsed.interpretation ?? "",
      entities: Array.isArray(parsed.entities) ? parsed.entities.filter((e) => e?.name && e?.meaning) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter(Boolean) : [],
    };
  }

  // Short narrative headline for the weekly / monthly recap. Best-effort: callers
  // should fall back to a computed string if this throws.
  async generateRecapHeadline(stats: RecapStats): Promise<string> {
    const periodLabel = stats.period === "week" ? "settimana" : "mese";
    const symbols = stats.recurringSymbols.slice(0, 3).map((s) => `${s.name} (${s.count}×)`).join(", ");
    const emotions = stats.topEmotions.slice(0, 3).map((e) => `${e.label} ${e.pct}%`).join(", ");

    const completion = await this.call("generateRecapHeadline", {
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Sei un narratore gentile che riassume l'andamento onirico di una persona in italiano, con tono caldo e poetico. Niente diagnosi.",
        },
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
      response_format: {
        type: "json_schema",
        json_schema: { name: "recap_headline", strict: true, schema: recapSchema },
      },
    });

    return this.parseJson<{ headline: string }>(completion).headline;
  }

  private parseJson<T>(completion: OpenAI.Chat.Completions.ChatCompletion): T {
    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      throw new ApplicationError("L'analizzatore ha rifiutato la richiesta", ErrorCode.INTERNAL_SERVER_ERROR);
    }
    const text = message?.content;
    if (!text) {
      throw new ApplicationError("Risposta dell'analizzatore vuota", ErrorCode.INTERNAL_SERVER_ERROR);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApplicationError("Risposta dell'analizzatore non valida", ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
}
