import { describe, expect, test } from "bun:test";

import {
  parseLessonGenerationDraft,
  parseCreateGenerationRunRequest,
  parseUpdateLessonUnitRequest,
  parseRegenerateLessonUnitRequest,
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

  test("accepts checkpoint patch updates", () => {
    const result = parseUpdateLessonUnitRequest({
      checkpointPatches: [
        {
          checkpointId: "checkpoint-1",
          promptMd: "Reworded prompt",
          expectedAnswerMd: "Reworded answer",
          rubric: [
            {
              rating: "wrong",
              description: "No clear sample-based explanation.",
            },
            {
              rating: "partial",
              description: "Some explanation present.",
            },
            {
              rating: "correct",
              description: "Correct explanation given.",
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        checkpointPatches: [
          {
            checkpointId: "checkpoint-1",
            promptMd: "Reworded prompt",
            expectedAnswerMd: "Reworded answer",
            rubric: [
              {
                rating: "wrong",
                description: "No clear sample-based explanation.",
              },
              {
                rating: "partial",
                description: "Some explanation present.",
              },
              {
                rating: "correct",
                description: "Correct explanation given.",
              },
            ],
          },
        ],
      },
    });
  });

  test("accepts checkpoint replacements", () => {
    const result = parseUpdateLessonUnitRequest({
      checkpointReplacements: [
        {
          promptMd: "Replacement prompt",
          expectedAnswerMd: "Replacement answer",
          rubric: [
            {
              rating: "wrong",
              description: "Needs all three samples.",
            },
            {
              rating: "partial",
              description: "Mentions a partial idea.",
            },
            {
              rating: "correct",
              description: "Provides full response.",
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        checkpointReplacements: [
          {
            promptMd: "Replacement prompt",
            expectedAnswerMd: "Replacement answer",
            rubric: [
              {
                rating: "wrong",
                description: "Needs all three samples.",
              },
              {
                rating: "partial",
                description: "Mentions a partial idea.",
              },
              {
                rating: "correct",
                description: "Provides full response.",
              },
            ],
          },
        ],
      },
    });
  });

  test("rejects empty checkpoint patch arrays", () => {
    expect(parseUpdateLessonUnitRequest({ checkpointPatches: [] })).toEqual({
      ok: false,
      issues: [
        {
          field: "checkpointPatches",
          message: "Expected at least one valid checkpoint patch.",
        },
      ],
    });
  });

  test("rejects simultaneous checkpoint patch and replacement payloads", () => {
    expect(
      parseUpdateLessonUnitRequest({
        checkpointPatches: [
          {
            checkpointId: "checkpoint-1",
            promptMd: "Reworded prompt",
            expectedAnswerMd: "Reworded answer",
            rubric: [
              {
                rating: "wrong",
                description: "No clear sample-based explanation.",
              },
              {
                rating: "partial",
                description: "Some explanation present.",
              },
              {
                rating: "correct",
                description: "Correct explanation given.",
              },
            ],
          },
        ],
        checkpointReplacements: [
          {
            promptMd: "Replacement prompt",
            expectedAnswerMd: "Replacement answer",
            rubric: [
              {
                rating: "wrong",
                description: "Needs all three samples.",
              },
              {
                rating: "partial",
                description: "Mentions a partial idea.",
              },
              {
                rating: "correct",
                description: "Provides full response.",
              },
            ],
          },
        ],
      }),
    ).toEqual({
      ok: false,
      issues: [
        {
          field: "body",
          message: "Cannot provide both checkpointPatches and checkpointReplacements.",
        },
      ],
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

  test("validates review status transitions", () => {
    const draft = parseUpdateLessonUnitRequest({
      reviewStatus: "approved",
    });

    expect(draft).toEqual({
      ok: true,
      value: {
        reviewStatus: "approved",
      },
    });

    const rejected = parseUpdateLessonUnitRequest({
      reviewStatus: "rejected",
      learningObjective: "Refine this objective for review.",
      reviewerNotes: "Needs stronger intuition examples.",
    });

    expect(rejected).toEqual({
      ok: true,
      value: {
        reviewStatus: "rejected",
        learningObjective: "Refine this objective for review.",
        reviewerNotes: "Needs stronger intuition examples.",
      },
    });

    const regenerateRequest = parseUpdateLessonUnitRequest({
      reviewStatus: "needs_regeneration",
    });

    expect(regenerateRequest).toEqual({
      ok: true,
      value: {
        reviewStatus: "needs_regeneration",
      },
    });
  });

  test("rejects invalid review-status changes", () => {
    const badRequest = parseUpdateLessonUnitRequest({
      reviewStatus: "pending",
    });

    expect(badRequest).toEqual({
      ok: false,
      issues: [
        {
          field: "reviewStatus",
          message: "Expected one of: draft, approved, rejected, needs_regeneration.",
        },
      ],
    });
  });

  test("rejects empty lesson-unit patch body", () => {
    expect(parseUpdateLessonUnitRequest({})).toEqual({
      ok: false,
      issues: [
        {
          field: "body",
          message: "Expected at least one updatable field.",
        },
      ],
    });
  });

  test("parses mock-only regenerate requests", () => {
    const body = parseRegenerateLessonUnitRequest({
      provider: "mock",
      reviewerNotes: "Need stronger intuition examples.",
    });

    expect(body).toEqual({
      ok: true,
      value: {
        provider: "mock",
        reviewerNotes: "Need stronger intuition examples.",
      },
    });
  });

  test("rejects invalid regenerate provider", () => {
    expect(parseRegenerateLessonUnitRequest({ provider: "palm" })).toEqual({
      ok: false,
      issues: [
        {
          field: "provider",
          message: 'Expected "mock" or "openai".',
        },
      ],
    });
  });
});
