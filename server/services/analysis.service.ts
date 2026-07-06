import OpenAI from "openai";
import { DreamType } from "@/generated/prisma/enums";
import ApplicationError, { ErrorCode } from "@/server/types/ApplicationError";

// A small, low-cost OpenAI model with structured-output (json_schema) support.
const MODEL = "gpt-4o-mini";

// Mirrors the chip list in dream-analyzer/src/models/Dream.ts, so inferred emotions
// stay consistent with what the user could have picked (and how recaps group them).
const EMOTIONS = ["Meraviglia", "Inquietudine", "Sereno", "Confuso", "Triste", "Gioia", "Paura", "Nostalgia"];

export type AnalysisInput = {
  type: DreamType;
  content: string;
  emotions?: string[];
  vividness?: number | null;
  // Previously asked questions and the user's answers, used to refine the reading.
  answers?: { question: string; answer: string }[];
};

export type AnalysisResult = {
  title: string;
  summary: string;
  interpretation: string;
  entities: { name: string; meaning: string }[];
  questions: string[];
  // The analyzer's own read of emotions/vividness. Callers should only use these to
  // fill in what the user left blank, not to override what they actually entered.
  emotions: string[];
  vividness: number;
};

export type RecapStats = {
  period: "week" | "month";
  dreams: number;
  nightmares: number;
  lucid: number;
  topEmotions: { label: string; pct: number }[];
  recurringSymbols: { name: string; count: number }[];
  patterns: { type: "symbol" | "nightmare"; text: string }[];
  // Same shape, computed for the immediately preceding period, if it was ever generated.
  previous?: {
    total: number;
    dreams: number;
    nightmares: number;
    lucid: number;
    topEmotions: { label: string; pct: number }[];
  };
};

export type RecapSummary = {
  title: string;
  evaluation: string;
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
    title: {
      type: "string",
      description:
        "Un titolo breve ed evocativo per il sogno (3-6 parole, in italiano), senza virgolette né punto finale.",
    },
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
    emotions: {
      type: "array",
      description:
        `Da 1 a 3 emozioni provate nel sogno, scelte esclusivamente tra: ${EMOTIONS.join(", ")}. ` +
        "Se il racconto indica già quali emozioni ha provato il sognatore, restituisci esattamente quelle; altrimenti deducile dal contenuto e dal tono del racconto.",
      items: { type: "string", enum: EMOTIONS },
    },
    vividness: {
      type: "integer",
      description:
        "Vividezza del sogno, da 0 a 100. Se il racconto indica già un valore di vividezza, restituisci lo stesso numero; altrimenti stimalo dal livello di dettaglio e concretezza del racconto.",
    },
  },
  required: ["title", "summary", "interpretation", "entities", "questions", "emotions", "vividness"],
};

const recapSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description:
        "Un titolo breve e diretto (3-6 parole) che nomina il tema dominante del periodo, senza toni poetici o metaforici.",
    },
    evaluation: {
      type: "string",
      description:
        "3-5 frasi in italiano che mettono insieme i dati del periodo (numero di sogni/incubi/lucidi, emozioni prevalenti, simboli ricorrenti, pattern individuati) in una lettura d'insieme coerente. Se sono forniti i dati del periodo precedente, commenta esplicitamente come sono cambiati (aumento/calo di incubi, emozioni diverse, nuovi o scomparsi simboli ricorrenti). Tono caldo ma concreto e basato sui dati, non poetico. Niente diagnosi.",
    },
  },
  required: ["title", "evaluation"],
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
      "Dai al sogno un titolo breve ed evocativo che ne catturi l'immagine o il tema centrale, senza virgolette.",
      "Restituisci sempre anche le emozioni provate e la vividezza: se il sognatore le ha indicate, ripetile invariate; se non le ha indicate, deducile dal racconto.",
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
      title: parsed.title?.trim() ?? "",
      summary: parsed.summary ?? "",
      interpretation: parsed.interpretation ?? "",
      entities: Array.isArray(parsed.entities) ? parsed.entities.filter((e) => e?.name && e?.meaning) : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter(Boolean) : [],
      emotions: Array.isArray(parsed.emotions) ? parsed.emotions.filter((e) => EMOTIONS.includes(e)) : [],
      vividness: typeof parsed.vividness === "number" ? Math.min(100, Math.max(0, parsed.vividness)) : 50,
    };
  }

  // Title + data-driven evaluation for the weekly / monthly recap. Best-effort:
  // callers should fall back to a computed summary if this throws.
  async generateRecapSummary(stats: RecapStats): Promise<RecapSummary> {
    const periodLabel = stats.period === "week" ? "settimana" : "mese";
    const symbols = stats.recurringSymbols.slice(0, 3).map((s) => `${s.name} (${s.count}×)`).join(", ");
    const emotions = stats.topEmotions.slice(0, 3).map((e) => `${e.label} ${e.pct}%`).join(", ");
    const patterns = stats.patterns.map((p) => p.text).join(" ");
    const previousEmotions = stats.previous?.topEmotions.slice(0, 3).map((e) => `${e.label} ${e.pct}%`).join(", ");
    const previous = stats.previous
      ? `Periodo precedente: ${stats.previous.total} notti (${stats.previous.dreams} sogni, ${stats.previous.nightmares} incubi, ${stats.previous.lucid} lucidi)` +
        (previousEmotions ? `, emozioni prevalenti: ${previousEmotions}` : "") +
        ".\n"
      : "";

    const completion = await this.call("generateRecapSummary", {
      model: MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Sei un analista che osserva i dati onirici di una persona su un periodo di tempo e ne offre una lettura chiara e coerente, in italiano. Metti in relazione i numeri, le emozioni e i simboli ricorrenti invece di limitarti a elencarli. Tono caldo ma concreto, evita frasi generiche o poetiche. Niente diagnosi.",
        },
        {
          role: "user",
          content:
            `Periodo: ultima ${periodLabel}.\n` +
            `Sogni: ${stats.dreams}, incubi: ${stats.nightmares}, sogni lucidi: ${stats.lucid}.\n` +
            (emotions ? `Emozioni prevalenti: ${emotions}.\n` : "") +
            (symbols ? `Simboli ricorrenti: ${symbols}.\n` : "") +
            (patterns ? `Pattern individuati: ${patterns}\n` : "") +
            previous +
            `Scrivi un titolo e una valutazione d'insieme per questo recap.` +
            (previous ? " Confronta esplicitamente con il periodo precedente." : ""),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "recap_summary", strict: true, schema: recapSchema },
      },
    });

    return this.parseJson<RecapSummary>(completion);
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
