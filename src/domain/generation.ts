import type { SourceAnchor } from "../shared/source";
import type { LessonGenerationDraft } from "../shared/generation";

export type GenerateLessonInput = {
  chapterTitle: string;
  bookTitle: string;
  markdown: string;
  learnerProfile: string;
  sourceAnchors: SourceAnchor[];
};

export interface LessonGenerator {
  generate(input: GenerateLessonInput): Promise<LessonGenerationDraft>;
}

