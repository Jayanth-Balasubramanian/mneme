import type { Database } from "bun:sqlite";

import type { WeakConceptSeedEvent } from "../../shared/study";
import type { SourceAnchor } from "../../shared/source";
import type {
  CreateStudyAttemptRequest,
  StudyAttemptResponse,
} from "../../shared/study";

type CheckpointContextRow = {
  lesson_unit_id: string;
  concept_keys_json: string;
  source_anchors_json: string;
};

type WeakConceptSeedRow = {
  concept_key: string;
  lesson_unit_id: string;
  checkpoint_id: string;
  event_payload_json: string | null;
  created_at: string;
};

function parseStringArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const values = parsed.filter(
      (entry): entry is string => typeof entry === "string",
    );

    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const value of values) {
      const normalized = value.trim();
      if (normalized.length === 0 || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      deduped.push(normalized);
    }

    return deduped;
  } catch {
    return [];
  }
}

function parseSourceAnchors(json: string): SourceAnchor[] {
  try {
    const parsed: unknown = JSON.parse(json);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((value): value is SourceAnchor => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return false;
        }

        return (
          Array.isArray(value.headingPath) &&
          value.headingPath.every((part: unknown) => typeof part === "string") &&
          typeof value.paragraphStart === "number" &&
          typeof value.paragraphEnd === "number" &&
          typeof value.sourceUrl === "string"
        );
      })
      .map((value) => ({
        headingPath: value.headingPath,
        paragraphStart: value.paragraphStart,
        paragraphEnd: value.paragraphEnd,
        sourceUrl: value.sourceUrl,
      }));
  } catch {
    return [];
  }
}

function parseWeakConceptSeedPayload(
  rawPayload: string | null,
): SourceAnchor[] {
  if (!rawPayload) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawPayload) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }

    if (!("sourceAnchors" in parsed)) {
      return [];
    }

    return parseSourceAnchors(
      JSON.stringify((parsed as { sourceAnchors: unknown }).sourceAnchors),
    );
  } catch {
    return [];
  }
}

export interface StudyAttemptRepository {
  createAttempt(
    input: CreateStudyAttemptRequest,
  ): Promise<StudyAttemptResponse | null>;
  listWeakConceptSeedEventsByChapterSourceId(
    chapterSourceId: string,
  ): Promise<WeakConceptSeedEvent[]>;
}

export class SQLiteStudyAttemptRepository implements StudyAttemptRepository {
  constructor(private readonly database: Database) {}

  async createAttempt(
    input: CreateStudyAttemptRequest,
  ): Promise<StudyAttemptResponse | null> {
    const checkpointContext = this.database
      .query<
        CheckpointContextRow,
        [string]
      >(
        `
          SELECT
            lu.id AS lesson_unit_id,
            lu.concept_keys_json,
            lu.source_anchors_json
          FROM checkpoints cp
          JOIN lesson_units lu
            ON lu.id = cp.lesson_unit_id
          WHERE cp.id = ?
            AND lu.review_status = 'approved'
        `,
      )
      .get(input.checkpointId);

    if (!checkpointContext) {
      return null;
    }

    const attemptId = crypto.randomUUID();
    const attemptedAt = new Date().toISOString();
    const conceptKeys = parseStringArray(checkpointContext.concept_keys_json);
    const sourceAnchors = parseSourceAnchors(checkpointContext.source_anchors_json);
    const conceptEventPayload = JSON.stringify({
      sourceAnchors,
      confidence: input.confidence,
      selfRating: input.selfRating,
    });

    const attemptInsert = this.database.query<
      undefined,
      [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    >(
      `
        INSERT INTO study_attempts (
          id,
          checkpoint_id,
          lesson_unit_id,
          answer_md,
          self_rating,
          confidence,
          concept_keys_json,
          source_anchors_json,
          attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    );

    const conceptEventInsert = this.database.query<
      undefined,
      [string, string, string, string, string, string, string]
    >(
      `
        INSERT INTO concept_events (
          id,
          lesson_unit_id,
          checkpoint_id,
          concept_key,
          event_type,
          event_payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    );

    this.database.transaction(() => {
      attemptInsert.run(
        attemptId,
        input.checkpointId,
        checkpointContext.lesson_unit_id,
        input.answerMd,
        input.selfRating,
        input.confidence,
        JSON.stringify(conceptKeys),
        JSON.stringify(sourceAnchors),
        attemptedAt,
      );

      if (input.selfRating === "wrong" || input.selfRating === "partial") {
        for (const conceptKey of conceptKeys) {
          conceptEventInsert.run(
            crypto.randomUUID(),
            checkpointContext.lesson_unit_id,
            input.checkpointId,
            conceptKey,
            "weak_concept",
            conceptEventPayload,
            attemptedAt,
          );
        }
      }
    })();

    return {
      id: attemptId,
      checkpointId: input.checkpointId,
      lessonUnitId: checkpointContext.lesson_unit_id,
      conceptKeys,
      sourceAnchors,
      selfRating: input.selfRating,
      confidence: input.confidence,
      attemptedAt,
    };
  }

  async listWeakConceptSeedEventsByChapterSourceId(
    chapterSourceId: string,
  ): Promise<WeakConceptSeedEvent[]> {
    const rows = this.database
      .query<WeakConceptSeedRow, [string]>(
        `
          SELECT
            ce.concept_key,
            ce.lesson_unit_id,
            ce.checkpoint_id,
            ce.event_payload_json,
            ce.created_at
          FROM concept_events ce
          JOIN lesson_units lu
            ON lu.id = ce.lesson_unit_id
          WHERE ce.event_type = 'weak_concept'
            AND lu.chapter_source_id = ?
          ORDER BY ce.created_at DESC
        `,
      )
      .all(chapterSourceId) as WeakConceptSeedRow[];

    return rows.map((row) => ({
      conceptKey: row.concept_key,
      lessonUnitId: row.lesson_unit_id,
      checkpointId: row.checkpoint_id,
      sourceAnchors: parseWeakConceptSeedPayload(row.event_payload_json),
      createdAt: row.created_at,
    }));
  }
}
