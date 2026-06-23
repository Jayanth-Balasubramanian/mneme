import type { SourceAnchor } from "../shared/source";
import type { WeakConceptSeedEvent, WeakConcept } from "../shared/study";

function uniqueSourceAnchors(
  anchors: SourceAnchor[],
): SourceAnchor[] {
  const unique = new Map<string, SourceAnchor>();

  for (const anchor of anchors) {
    const key = JSON.stringify(anchor);
    unique.set(key, anchor);
  }

  return [...unique.values()];
}

export function deriveWeakConcepts(
  events: Iterable<WeakConceptSeedEvent>,
): WeakConcept[] {
  const buckets = new Map<
    string,
    {
      attempts: number;
      latestAttemptAt: string;
      lessonUnitIds: Set<string>;
      sourceAnchors: Map<string, SourceAnchor>;
    }
  >();

  for (const event of events) {
    const conceptKey = event.conceptKey.trim();
    if (conceptKey.length === 0) {
      continue;
    }

    const existing = buckets.get(conceptKey);

    if (!existing) {
      buckets.set(conceptKey, {
        attempts: 1,
        latestAttemptAt: event.createdAt,
        lessonUnitIds: new Set([event.lessonUnitId]),
        sourceAnchors: new Map(
          uniqueSourceAnchors(event.sourceAnchors).map((anchor) => [
            JSON.stringify(anchor),
            anchor,
          ]),
        ),
      });
      continue;
    }

    existing.attempts += 1;
    existing.lessonUnitIds.add(event.lessonUnitId);

    for (const anchor of uniqueSourceAnchors(event.sourceAnchors)) {
      existing.sourceAnchors.set(JSON.stringify(anchor), anchor);
    }

    if (event.createdAt > existing.latestAttemptAt) {
      existing.latestAttemptAt = event.createdAt;
    }
  }

  return [...buckets.entries()]
    .map(([conceptKey, aggregate]) => ({
      conceptKey,
      attempts: aggregate.attempts,
      latestAttemptAt: aggregate.latestAttemptAt,
      lessonUnitIds: [...aggregate.lessonUnitIds.values()],
      sourceAnchors: [...aggregate.sourceAnchors.values()],
    }))
    .sort((a, b) => {
      if (a.latestAttemptAt === b.latestAttemptAt) {
        return a.conceptKey.localeCompare(b.conceptKey);
      }

      return a.latestAttemptAt < b.latestAttemptAt ? 1 : -1;
    });
}
