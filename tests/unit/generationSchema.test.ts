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
});

