import type { SourceAnchor } from "../../shared/source";
import type {
  LessonGenerationDraft,
  LessonGenerationCheckpoint,
  LessonGenerationUnit,
  LessonUnitResponse,
} from "../../shared/generation";
import type {
  GenerateLessonInput,
  LessonGenerator,
} from "../../domain/generation";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDefaultAnchor(): SourceAnchor {
  return {
    headingPath: ["Chapter excerpt"],
    paragraphStart: 1,
    paragraphEnd: 1,
    sourceUrl: "https://example.com/local-source",
  };
}

function cloneCheckpoints(
  checkpoints: LessonUnitResponse["checkpoints"],
): LessonGenerationCheckpoint[] {
  return checkpoints.map((checkpoint) => ({
    promptMd: `${checkpoint.promptMd} (reframed)`,
    expectedAnswerMd: checkpoint.expectedAnswerMd,
    rubric: checkpoint.rubric.map((rubricItem) => ({ ...rubricItem })),
  }));
}

export function buildMockRegeneratedLessonUnit(
  unit: LessonUnitResponse,
  reviewerNotes?: string,
): LessonGenerationUnit {
  const trimmedNotes = reviewerNotes?.trim();
  const notesSuffix = trimmedNotes
    ? ` Incorporated reviewer notes: ${trimmedNotes}.`
    : "";
  const anchorLabel =
    unit.sourceAnchors[0]?.headingPath.at(-1) ?? "selected concept";

  return {
    title: `${unit.title} (Revised)`,
    learningObjective: `${unit.learningObjective} (rephrased)`,
    conceptKeys: [...unit.conceptKeys],
    sourceAnchors: unit.sourceAnchors.map((anchor) => ({
      ...anchor,
      headingPath: [...anchor.headingPath],
    })),
    explanationMd: `Revised draft for ${anchorLabel}.${notesSuffix}\n\n${unit.explanationMd}`,
    intuitionMd: `Revised intuition for ${anchorLabel}.${notesSuffix}\n\n${unit.intuitionMd}`,
    notationMd: unit.notationMd,
    exampleMd: unit.exampleMd,
    misconceptionMd:
      unit.misconceptionMd ||
      "Review the distinction between expectation and bias for this concept.",
    checkpoints: cloneCheckpoints(unit.checkpoints),
  };
}

export class MockLessonGenerator implements LessonGenerator {
  async generate(input: GenerateLessonInput): Promise<LessonGenerationDraft> {
    const targetUnits = Math.min(Math.max(input.sourceAnchors.length, 1), 2);
    const excerpt = input.markdown.trim().split("\n", 2).join(" ");
    const anchors =
      input.sourceAnchors.length > 0
        ? input.sourceAnchors
        : [buildDefaultAnchor()];

    const units: LessonGenerationUnit[] = [];

    for (let index = 0; index < targetUnits; index += 1) {
      const anchor = anchors[index] ?? anchors.at(-1);
      const anchorLabel = anchor?.headingPath.at(-1) ?? "Core idea";
      const conceptKey = `${slugify(anchorLabel)}-${index + 1}`;

      units.push({
        title: `Mock lesson unit ${index + 1}: ${anchorLabel}`,
        learningObjective: `Describe ${anchorLabel} and connect it to Monte Carlo intuition.`,
        conceptKeys: [conceptKey],
        sourceAnchors: [anchor ?? anchors[0]],
        explanationMd: `This mock unit explains ${anchorLabel} using the excerpt: "${excerpt}".`,
        intuitionMd: `To build intuition, compare ${anchorLabel} to repeated random sampling and averaging.`,
        notationMd: `\\[\\hat{\\mu} = \\frac{1}{N} \\sum_{i=1}^N f(x_i)\\]`,
        exampleMd: "Use a small sample of random draws to estimate an average quantity.",
        misconceptionMd:
          "A common mistake is confusing unbiased estimates with low-variance estimates for small sample counts.",
        checkpoints: [
          {
            promptMd: `What is the core idea of ${anchorLabel}?`,
            expectedAnswerMd: `An explanation linking sampling/averaging to the concept of ${anchorLabel}.`,
            rubric: [
              { rating: "wrong", description: "No mention of sampling or averaging." },
              {
                rating: "partial",
                description:
                  "Mentions sampling but misses how averaging supports estimation.",
              },
              {
                rating: "correct",
                description:
                  "Clearly explains sampling and averaging with relation to the concept.",
              },
            ],
          },
        ],
      });
    }

    return {
      title: `Mock lesson for ${input.chapterTitle}`,
      summary: `Automatically generated mock lesson for ${input.bookTitle}, chapter ${input.chapterTitle}.`,
      units,
    };
  }
}
