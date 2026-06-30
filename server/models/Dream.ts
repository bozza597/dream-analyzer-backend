import { Dream as _Dream, DreamEntity as _DreamEntity, DreamQuestion as _DreamQuestion } from "@/generated/prisma/client";

export type DreamEntityModel = _DreamEntity;
export type DreamQuestionModel = _DreamQuestion;

export type DreamModel = _Dream & {
  entities?: DreamEntityModel[];
  questions?: DreamQuestionModel[];
};
