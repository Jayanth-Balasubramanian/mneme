import { describe, expect, test } from "bun:test";

import {
  parseLessonGenerationDraft,
  parseCreateGenerationRunRequest,
} from "../../src/shared/generation";

describe("generation request schema", () => {
  test("accepts a valid generation request", () => {
    const parsed = parseCreateGenerationRunRequest({
      chapterSourceId: "chapter-id",
      provider: "mock",
      learnerProfile: "Applied ML student.",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        chapterSourceId: "chapter-id",
        provider: "mock",
        learnerProfile: "Applied ML student.",
      },
    });
  });
});

describe("lesson generation draft validation", () => {
  test("accepts valid generated units and checkpoints", () => {
    const result = parseLessonGenerationDraft({
      title: "Mock lesson draft",
      summary: "A short summary.",
      units: [
        {
          title: "Sampling intuition",
          learningObjective: "Explain sampling.",
          conceptKeys: ["sampling-intuition"],
          sourceAnchors: [
            {
              headingPath: ["Chapter 17"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
            },
          ],
          explanationMd: "A unit explains the estimator.",
          intuitionMd: "Think of an experiment repeated many times.",
          checkpoints: [
            {
              promptMd: "What is Monte Carlo estimation?",
              expectedAnswerMd: "An estimate from averaging random samples.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No sample-based estimation.",
                },
                {
                  rating: "partial",
                  description: "Mentions sampling only.",
                },
                {
                  rating: "correct",
                  description: "Explains averaging of random samples.",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.units).toHaveLength(1);
    expect(result.value.units[0].conceptKeys).toEqual(["sampling-intuition"]);
  });

  test("rejects generated output missing concept keys or anchors", () => {
    const result = parseLessonGenerationDraft({
      title: "Invalid draft",
      summary: "Missing required fields.",
      units: [
        {
          title: "Bad unit",
          learningObjective: "Missing keys",
          conceptKeys: [],
          sourceAnchors: [],
          explanationMd: "No anchors.",
          intuitionMd: "No anchors.",
          checkpoints: [
            {
              promptMd: "Prompt?",
              expectedAnswerMd: "answer",
              rubric: [
                {
                  rating: "wrong",
                  description: "No rating quality.",
                },
                {
                  rating: "partial",
                  description: "Some quality.",
                },
                {
                  rating: "correct",
                  description: "Correct quality.",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.field)).toContain("units");
  });

  test("rejects mixed valid and invalid concept key entries", () => {
    const result = parseLessonGenerationDraft({
      title: "Invalid concept keys",
      summary: "Contains one valid and one invalid concept key.",
      units: [
        {
          title: "Bad concept keys",
          learningObjective: "Verify strict array validation.",
          conceptKeys: ["valid-concept", 42],
          sourceAnchors: [
            {
              headingPath: ["Chapter 17"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
            },
          ],
          explanationMd: "A unit with mixed concept key types.",
          intuitionMd: "A unit with mixed concept key types.",
          checkpoints: [
            {
              promptMd: "What is this?",
              expectedAnswerMd: "A mixed-type concept key concept.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No sample-based estimation.",
                },
                {
                  rating: "partial",
                  description: "Some quality.",
                },
                {
                  rating: "correct",
                  description: "Correct response.",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.field)).toContain(
      "conceptKeys[1]",
    );
  });

  test("rejects mixed valid and invalid headingPath entries", () => {
    const result = parseLessonGenerationDraft({
      title: "Invalid headingPath",
      summary: "Contains mixed heading path entries.",
      units: [
        {
          title: "Bad heading path",
          learningObjective: "Verify headingPath entry strictness.",
          conceptKeys: ["concept-key"],
          sourceAnchors: [
            {
              headingPath: ["Chapter 17", 99],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
            },
          ],
          explanationMd: "A unit with mixed headingPath entries.",
          intuitionMd: "A unit with mixed headingPath entries.",
          checkpoints: [
            {
              promptMd: "What is this?",
              expectedAnswerMd: "A heading path validation check.",
              rubric: [
                {
                  rating: "wrong",
                  description: "Missing heading path strictness.",
                },
                {
                  rating: "partial",
                  description: "Only partially checked.",
                },
                {
                  rating: "correct",
                  description: "Correct handling of mixed types.",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.field)).toContain(
      "sourceAnchors[0].headingPath[1]",
    );
  });
});
