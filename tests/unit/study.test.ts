import { describe, expect, test } from "bun:test";

import type { SourceAnchor } from "../../src/shared/source";
import { deriveWeakConcepts } from "../../src/domain/study";

const commonAnchor: SourceAnchor = {
  headingPath: ["Chapter 17", "MC"],
  paragraphStart: 1,
  paragraphEnd: 1,
  sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
};

describe("study telemetry derivation", () => {
  test("aggregates weak concept signals into latest attempt summaries", () => {
    const concepts = deriveWeakConcepts([
      {
        conceptKey: "variance-control",
        lessonUnitId: "unit-1",
        checkpointId: "cp-1",
        sourceAnchors: [commonAnchor],
        createdAt: "2026-06-20T10:00:00.000Z",
      },
      {
        conceptKey: "sampling-intuition",
        lessonUnitId: "unit-2",
        checkpointId: "cp-2",
        sourceAnchors: [commonAnchor],
        createdAt: "2026-06-20T10:00:30.000Z",
      },
      {
        conceptKey: "sampling-intuition",
        lessonUnitId: "unit-3",
        checkpointId: "cp-3",
        sourceAnchors: [],
        createdAt: "2026-06-20T10:01:00.000Z",
      },
      {
        conceptKey: "sampling-intuition",
        lessonUnitId: "unit-2",
        checkpointId: "cp-2",
        sourceAnchors: [commonAnchor],
        createdAt: "2026-06-20T10:02:00.000Z",
      },
    ]);

    expect(concepts).toEqual([
      {
        conceptKey: "sampling-intuition",
        attempts: 3,
        latestAttemptAt: "2026-06-20T10:02:00.000Z",
        lessonUnitIds: ["unit-2", "unit-3"],
        sourceAnchors: [commonAnchor],
      },
      {
        conceptKey: "variance-control",
        attempts: 1,
        latestAttemptAt: "2026-06-20T10:00:00.000Z",
        lessonUnitIds: ["unit-1"],
        sourceAnchors: [commonAnchor],
      },
    ]);
  });

  test("deduplicates concept unit ids and anchors in one concept bucket", () => {
    const sharedAnchor: SourceAnchor = {
      headingPath: ["Chapter 17", "Sampling"],
      paragraphStart: 2,
      paragraphEnd: 3,
      sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
    };

    const concepts = deriveWeakConcepts([
      {
        conceptKey: "mc-estimation",
        lessonUnitId: "unit-a",
        checkpointId: "cp-1",
        sourceAnchors: [sharedAnchor, sharedAnchor],
        createdAt: "2026-06-20T10:05:00.000Z",
      },
      {
        conceptKey: "mc-estimation",
        lessonUnitId: "unit-a",
        checkpointId: "cp-2",
        sourceAnchors: [sharedAnchor],
        createdAt: "2026-06-20T10:06:00.000Z",
      },
      {
        conceptKey: "mc-estimation",
        lessonUnitId: "unit-b",
        checkpointId: "cp-3",
        sourceAnchors: [sharedAnchor],
        createdAt: "2026-06-20T10:07:00.000Z",
      },
    ]);

    expect(concepts).toEqual([
      {
        conceptKey: "mc-estimation",
        attempts: 3,
        latestAttemptAt: "2026-06-20T10:07:00.000Z",
        lessonUnitIds: ["unit-a", "unit-b"],
        sourceAnchors: [sharedAnchor],
      },
    ]);
  });

  test("ignores empty concept keys when deriving telemetry", () => {
    const concepts = deriveWeakConcepts([
      {
        conceptKey: "   ",
        lessonUnitId: "unit-a",
        checkpointId: "cp-1",
        sourceAnchors: [],
        createdAt: "2026-06-20T10:00:00.000Z",
      },
      {
        conceptKey: "valid-concept",
        lessonUnitId: "unit-b",
        checkpointId: "cp-2",
        sourceAnchors: [],
        createdAt: "2026-06-20T10:01:00.000Z",
      },
    ]);

    expect(concepts).toEqual([
      {
        conceptKey: "valid-concept",
        attempts: 1,
        latestAttemptAt: "2026-06-20T10:01:00.000Z",
        lessonUnitIds: ["unit-b"],
        sourceAnchors: [],
      },
    ]);
  });
});
