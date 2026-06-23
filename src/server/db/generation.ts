import type { Database, SQLQueryBindings } from "bun:sqlite";

import type {
  SourceAnchor,
  SourceContextSnippet,
  SourceCredit,
} from "../../shared/source";
import {
  extractSourceContextFromAnchors,
  toSourceCredit,
} from "../../domain/source";
import type {
  LessonGenerationCheckpoint,
  UpdateCheckpointPatch,
  LessonGenerationUnit,
  LessonUnitListResponse,
  LessonUnitResponse,
  ReviewStatus,
} from "../../shared/generation";

type GenerationRunRow = {
  id: string;
  chapter_source_id: string;
  provider: string;
  model: string | null;
  prompt_version: string;
  status: "succeeded" | "failed";
  input_summary: string;
  raw_output_json: string;
  error_message: string | null;
  created_at: string;
};

export type GenerationRun = {
  id: string;
  chapterSourceId: string;
  provider: string;
  model?: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  inputSummary: string;
  rawOutputJson: string;
  errorMessage?: string;
  createdAt: string;
};

export type LessonUnitDraft = LessonGenerationUnit & { orderIndex: number };

type LessonUnitListRow = {
  lesson_unit_id: string;
  chapter_source_id: string;
  generation_run_id: string;
  order_index: number;
  title: string;
  learning_objective: string;
  concept_keys_json: string;
  source_anchors_json: string;
  explanation_md: string;
  intuition_md: string;
  notation_md: string | null;
  example_md: string | null;
  misconception_md: string | null;
  review_status: ReviewStatus;
  reviewer_notes: string | null;
  lesson_unit_created_at: string;
  lesson_unit_updated_at: string;

  checkpoint_id: string | null;
  checkpoint_order_index: number | null;
  prompt_md: string | null;
  expected_answer_md: string | null;
  rubric_json: string | null;
  markdown: string;
};

type LessonUnitUpdatePatch = {
  title?: string;
  learningObjective?: string;
  explanationMd?: string;
  intuitionMd?: string;
  notationMd?: string | null;
  exampleMd?: string | null;
  misconceptionMd?: string | null;
  reviewerNotes?: string | null;
  reviewStatus?: ReviewStatus;
  generationRunId?: string;
  checkpointPatches?: UpdateCheckpointPatch[];
  checkpointReplacements?: LessonGenerationCheckpoint[];
};

type SourceCreditRow = {
  id: string;
  book_title: string;
  authors_json: string;
  publisher: string | null;
  year: number | null;
  chapter_title: string;
  chapter_number: string | null;
  source_url: string;
  citation_text: string;
};

function parseStringArray(json: string): string[] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((value): value is string => typeof value === "string");
}

function parseSourceAnchors(json: string): SourceAnchor[] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((value): value is SourceAnchor => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
      }

      return (
        Array.isArray(value.headingPath) &&
        value.headingPath.every((part: unknown) => typeof part === "string") &&
        typeof value.paragraphStart === "number" &&
        typeof value.paragraphEnd === "number" &&
        typeof value.sourceUrl === "string"
      );
    });
}

function parseRubric(json: string): LessonGenerationCheckpoint["rubric"] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (entry): entry is LessonGenerationCheckpoint["rubric"][number] =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.rating === "string" &&
        typeof entry.description === "string" &&
        ["wrong", "partial", "correct"].includes(entry.rating),
    )
    .map((entry) => ({
      rating: entry.rating as
        | "wrong"
        | "partial"
        | "correct",
      description: entry.description,
    }));
}

function buildSourceContext(
  markdown: string,
  sourceAnchors: SourceAnchor[],
): SourceContextSnippet[] {
  return extractSourceContextFromAnchors(markdown, sourceAnchors, {
    contextRadius: 1,
    maxParagraphs: 8,
  }).map((snippet) => ({
    ...snippet,
    headingPath: [...snippet.headingPath],
  }));
}

function mapGenerationRunRow(row: GenerationRunRow): GenerationRun {
  return {
    id: row.id,
    chapterSourceId: row.chapter_source_id,
    provider: row.provider,
    model: row.model ?? undefined,
    promptVersion: row.prompt_version,
    status: row.status,
    inputSummary: row.input_summary,
    rawOutputJson: row.raw_output_json,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

function mapLessonUnitRows(
  rows: LessonUnitListRow[],
  sourceCredit: SourceCredit,
): LessonUnitResponse[] {
  const byUnit = new Map<string, LessonUnitResponse>();

  for (const row of rows) {
    const existing = byUnit.get(row.lesson_unit_id);

    if (!existing) {
      const sourceAnchors = parseSourceAnchors(row.source_anchors_json);

      byUnit.set(row.lesson_unit_id, {
        id: row.lesson_unit_id,
        chapterSourceId: row.chapter_source_id,
        generationRunId: row.generation_run_id,
        orderIndex: row.order_index,
        title: row.title,
        learningObjective: row.learning_objective,
        conceptKeys: parseStringArray(row.concept_keys_json),
        sourceAnchors,
        explanationMd: row.explanation_md,
        intuitionMd: row.intuition_md,
        notationMd: row.notation_md ?? undefined,
        exampleMd: row.example_md ?? undefined,
        misconceptionMd: row.misconception_md ?? undefined,
        reviewStatus: row.review_status,
        reviewerNotes: row.reviewer_notes ?? undefined,
        sourceContext: buildSourceContext(row.markdown, sourceAnchors),
        checkpoints: [],
        sourceCredit,
        createdAt: row.lesson_unit_created_at,
        updatedAt: row.lesson_unit_updated_at,
      });
    }

    const unit = byUnit.get(row.lesson_unit_id);

    if (!unit) {
      continue;
    }

    if (row.checkpoint_id && row.prompt_md && row.expected_answer_md) {
      unit.checkpoints.push({
        id: row.checkpoint_id,
        lessonUnitId: row.lesson_unit_id,
        orderIndex: row.checkpoint_order_index ?? 0,
        promptMd: row.prompt_md,
        expectedAnswerMd: row.expected_answer_md,
        rubric: parseRubric(row.rubric_json ?? "[]"),
      });
    }
  }

  return [...byUnit.values()].sort((left, right) => left.orderIndex - right.orderIndex);
}

export interface GenerationPersistence {
  createGenerationRun(input: {
    chapterSourceId: string;
    provider: "mock" | "openai";
    model?: string;
    promptVersion: string;
    status: "succeeded" | "failed";
    inputSummary: string;
    rawOutputJson: string;
    errorMessage?: string;
  }): Promise<GenerationRun>;

  createDraftLessonUnits(input: {
    chapterSourceId: string;
    generationRunId: string;
    units: LessonUnitDraft[];
  }): Promise<string[]>;

  findGenerationRunById(id: string): Promise<GenerationRun | null>;

  listUnitsByChapterSourceId(
    chapterSourceId: string,
    reviewStatuses?: ReviewStatus[],
  ): Promise<LessonUnitListResponse["units"]>;

  findLessonUnitById(id: string): Promise<LessonUnitResponse | null>;

  updateLessonUnitById(
    lessonUnitId: string,
    patch: LessonUnitUpdatePatch,
  ): Promise<LessonUnitResponse | null>;

  replaceLessonUnitById(
    lessonUnitId: string,
    replacement: {
      generationRunId: string;
      title: string;
      learningObjective: string;
      conceptKeys: string[];
      sourceAnchors: SourceAnchor[];
      explanationMd: string;
      intuitionMd: string;
      notationMd?: string | null;
      exampleMd?: string | null;
      misconceptionMd?: string | null;
      reviewerNotes?: string | null;
      checkpoints: LessonGenerationCheckpoint[];
      reviewStatus?: ReviewStatus;
    },
  ): Promise<LessonUnitResponse | null>;
}

export class SQLiteGenerationPersistence implements GenerationPersistence {
  constructor(private readonly database: Database) {}

  async createGenerationRun(input: {
    chapterSourceId: string;
    provider: "mock" | "openai";
    model?: string;
    promptVersion: string;
    status: "succeeded" | "failed";
    inputSummary: string;
    rawOutputJson: string;
    errorMessage?: string;
  }): Promise<GenerationRun> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    this.database
      .query<
        undefined,
        [
          string,
          string,
          string,
          string | null,
          string,
          string,
          string,
          string,
          string | null,
          string,
        ]
      >(`
        INSERT INTO generation_runs (
          id,
          chapter_source_id,
          provider,
          model,
          prompt_version,
          status,
          input_summary,
          raw_output_json,
          error_message,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.chapterSourceId,
        input.provider,
        input.model ?? null,
        input.promptVersion,
        input.status,
        input.inputSummary,
        input.rawOutputJson,
        input.errorMessage ?? null,
        createdAt,
      );

    return {
      id,
      chapterSourceId: input.chapterSourceId,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      status: input.status,
      inputSummary: input.inputSummary,
      rawOutputJson: input.rawOutputJson,
      errorMessage: input.errorMessage,
      createdAt,
    };
  }

  async createDraftLessonUnits(input: {
    chapterSourceId: string;
    generationRunId: string;
    units: LessonUnitDraft[];
  }): Promise<string[]> {
    const unitIds: string[] = [];
    const unitInsert = this.database.query<
      undefined,
      [
        string,
        string,
        string,
        number,
        string,
        string,
        string,
        string,
        string,
        string,
        string | null,
        string | null,
        string | null,
        string,
        string | null,
        string,
        string,
      ]
    >(`
      INSERT INTO lesson_units (
        id,
        chapter_source_id,
        generation_run_id,
        order_index,
        title,
        learning_objective,
        concept_keys_json,
        source_anchors_json,
        explanation_md,
        intuition_md,
        notation_md,
        example_md,
        misconception_md,
        review_status,
        reviewer_notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkpointInsert = this.database.query<
      undefined,
      [string, string, number, string, string, string, string, string]
    >(`
      INSERT INTO checkpoints (
        id,
        lesson_unit_id,
        order_index,
        prompt_md,
        expected_answer_md,
        rubric_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    for (const unit of input.units) {
      const unitId = crypto.randomUUID();
      unitIds.push(unitId);

      unitInsert.run(
        unitId,
        input.chapterSourceId,
        input.generationRunId,
        unit.orderIndex,
        unit.title,
        unit.learningObjective,
        JSON.stringify(unit.conceptKeys),
        JSON.stringify(unit.sourceAnchors),
        unit.explanationMd,
        unit.intuitionMd,
        unit.notationMd ?? null,
        unit.exampleMd ?? null,
        unit.misconceptionMd ?? null,
        "draft",
        null,
        now,
        now,
      );

      for (const [index, checkpoint] of unit.checkpoints.entries()) {
        const checkpointId = crypto.randomUUID();
        checkpointInsert.run(
          checkpointId,
          unitId,
          index,
          checkpoint.promptMd,
          checkpoint.expectedAnswerMd,
          JSON.stringify(checkpoint.rubric),
          now,
          now,
        );
      }
    }

    return unitIds;
  }

  async findGenerationRunById(id: string): Promise<GenerationRun | null> {
    const row = this.database
      .query<GenerationRunRow, [string]>(`
        SELECT
          id,
          chapter_source_id,
          provider,
          model,
          prompt_version,
          status,
          input_summary,
          raw_output_json,
          error_message,
          created_at
        FROM generation_runs
        WHERE id = ?
      `)
      .get(id);

    return row ? mapGenerationRunRow(row) : null;
  }

  async listUnitsByChapterSourceId(
    chapterSourceId: string,
    reviewStatuses?: ReviewStatus[],
  ): Promise<LessonUnitListResponse["units"]> {
    const whereStatuses =
      (reviewStatuses && reviewStatuses.length > 0)
        ? `AND lu.review_status IN (${reviewStatuses.map(() => "?").join(",")})`
        : "";
    const queryParams: SQLQueryBindings[] = [
      chapterSourceId,
      ...(reviewStatuses ?? []),
    ];

    const rows = this.database
      .query<
        LessonUnitListRow & SourceCreditRow,
        [string, ...SQLQueryBindings[]]
      >(`
        SELECT
          lu.id AS lesson_unit_id,
          lu.chapter_source_id,
          lu.generation_run_id,
          lu.order_index,
          lu.title,
          lu.learning_objective,
          lu.concept_keys_json,
          lu.source_anchors_json,
          lu.explanation_md,
          lu.intuition_md,
          lu.notation_md,
          lu.example_md,
          lu.misconception_md,
          lu.review_status,
          lu.reviewer_notes,
          lu.created_at AS lesson_unit_created_at,
          lu.updated_at AS lesson_unit_updated_at,
          cp.id AS checkpoint_id,
          cp.order_index AS checkpoint_order_index,
          cp.prompt_md,
          cp.expected_answer_md,
          cp.rubric_json,
          cs.book_title,
          cs.authors_json,
          cs.publisher,
          cs.year,
          cs.chapter_title,
          cs.chapter_number,
          cs.source_url,
          cs.citation_text,
          cs.markdown
        FROM lesson_units lu
        LEFT JOIN checkpoints cp
          ON cp.lesson_unit_id = lu.id
        LEFT JOIN chapter_sources cs
          ON cs.id = lu.chapter_source_id
        WHERE lu.chapter_source_id = ? ${whereStatuses}
        ORDER BY lu.order_index ASC, cp.order_index ASC
      `)
      .all(...(queryParams as [string, ...SQLQueryBindings[]])) as Array<
      LessonUnitListRow & SourceCreditRow
    >;

    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    const sourceCredit: SourceCredit = toSourceCredit({
      bookTitle: firstRow.book_title,
      authors: parseStringArray(firstRow.authors_json),
      publisher: firstRow.publisher ?? undefined,
      year: firstRow.year ?? undefined,
      chapterTitle: firstRow.chapter_title,
      chapterNumber: firstRow.chapter_number ?? undefined,
      sourceUrl: firstRow.source_url,
      citationText: firstRow.citation_text,
    });

    return mapLessonUnitRows(rows, sourceCredit);
  }

  async findLessonUnitById(id: string): Promise<LessonUnitResponse | null> {
    const rows = this.database
      .query<LessonUnitListRow & SourceCreditRow, [string]>(`
        SELECT
          lu.id AS lesson_unit_id,
          lu.chapter_source_id,
          lu.generation_run_id,
          lu.order_index,
          lu.title,
          lu.learning_objective,
          lu.concept_keys_json,
          lu.source_anchors_json,
          lu.explanation_md,
          lu.intuition_md,
          lu.notation_md,
          lu.example_md,
          lu.misconception_md,
          lu.review_status,
          lu.reviewer_notes,
          lu.created_at AS lesson_unit_created_at,
          lu.updated_at AS lesson_unit_updated_at,
          cp.id AS checkpoint_id,
          cp.order_index AS checkpoint_order_index,
          cp.prompt_md,
          cp.expected_answer_md,
          cp.rubric_json,
          cs.book_title,
          cs.authors_json,
          cs.publisher,
          cs.year,
          cs.chapter_title,
          cs.chapter_number,
          cs.source_url,
          cs.citation_text,
          cs.markdown
        FROM lesson_units lu
        LEFT JOIN checkpoints cp
          ON cp.lesson_unit_id = lu.id
        LEFT JOIN chapter_sources cs
          ON cs.id = lu.chapter_source_id
        WHERE lu.id = ?
        ORDER BY cp.order_index ASC
      `)
      .all(id) as Array<LessonUnitListRow & SourceCreditRow>;

    if (rows.length === 0) {
      return null;
    }

    const firstRow = rows[0];
    const sourceCredit: SourceCredit = toSourceCredit({
      bookTitle: firstRow.book_title,
      authors: parseStringArray(firstRow.authors_json),
      publisher: firstRow.publisher ?? undefined,
      year: firstRow.year ?? undefined,
      chapterTitle: firstRow.chapter_title,
      chapterNumber: firstRow.chapter_number ?? undefined,
      sourceUrl: firstRow.source_url,
      citationText: firstRow.citation_text,
    });

    return mapLessonUnitRows(rows, sourceCredit)[0] ?? null;
  }

  private replaceUnitCheckpoints(
    lessonUnitId: string,
    checkpoints: LessonGenerationCheckpoint[],
    updatedAt: string,
  ): void {
    const checkpointDelete = this.database.query<undefined, [string]>(`
      DELETE FROM checkpoints
      WHERE lesson_unit_id = ?
    `);

    const checkpointInsert = this.database.query<
      undefined,
      [string, string, number, string, string, string, string, string]
    >(
      `
      INSERT INTO checkpoints (
        id,
        lesson_unit_id,
        order_index,
        prompt_md,
        expected_answer_md,
        rubric_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    this.database.transaction(() => {
      checkpointDelete.run(lessonUnitId);

      for (const [index, checkpoint] of checkpoints.entries()) {
        const checkpointId = crypto.randomUUID();
        checkpointInsert.run(
          checkpointId,
          lessonUnitId,
          index,
          checkpoint.promptMd,
          checkpoint.expectedAnswerMd,
          JSON.stringify(checkpoint.rubric),
          updatedAt,
          updatedAt,
        );
      }
    })();
  }

  async updateLessonUnitById(
    lessonUnitId: string,
    patch: LessonUnitUpdatePatch,
  ): Promise<LessonUnitResponse | null> {
    const setSegments: string[] = [];
    const values: SQLQueryBindings[] = [];
    const now = new Date().toISOString();

    if (patch.title !== undefined) {
      setSegments.push("title = ?");
      values.push(patch.title);
    }

    if (patch.learningObjective !== undefined) {
      setSegments.push("learning_objective = ?");
      values.push(patch.learningObjective);
    }

    if (patch.explanationMd !== undefined) {
      setSegments.push("explanation_md = ?");
      values.push(patch.explanationMd);
    }

    if (patch.intuitionMd !== undefined) {
      setSegments.push("intuition_md = ?");
      values.push(patch.intuitionMd);
    }

    if (patch.notationMd !== undefined) {
      setSegments.push("notation_md = ?");
      values.push(patch.notationMd);
    }

    if (patch.exampleMd !== undefined) {
      setSegments.push("example_md = ?");
      values.push(patch.exampleMd);
    }

    if (patch.misconceptionMd !== undefined) {
      setSegments.push("misconception_md = ?");
      values.push(patch.misconceptionMd);
    }

    if (patch.reviewerNotes !== undefined) {
      setSegments.push("reviewer_notes = ?");
      values.push(patch.reviewerNotes);
    }

    if (patch.reviewStatus !== undefined) {
      setSegments.push("review_status = ?");
      values.push(patch.reviewStatus);
    }

    if (patch.generationRunId !== undefined) {
      setSegments.push("generation_run_id = ?");
      values.push(patch.generationRunId);
    }

    const hasCheckpointPatches = (patch.checkpointPatches?.length ?? 0) > 0;
    const hasCheckpointReplacements = patch.checkpointReplacements !== undefined;

    if (
      setSegments.length === 0 &&
      !hasCheckpointPatches &&
      !hasCheckpointReplacements
    ) {
      return this.findLessonUnitById(lessonUnitId);
    }

    setSegments.push("updated_at = ?");
    values.push(now);

    const updateLessonUnitQuery = `
      UPDATE lesson_units
      SET ${setSegments.join(", ")}
      WHERE id = ?
    `;

    const checkpointPatchQuery = this.database.query<
      undefined,
      SQLQueryBindings[]
    >(`
      UPDATE checkpoints
      SET prompt_md = COALESCE(?, prompt_md),
          expected_answer_md = COALESCE(?, expected_answer_md),
          rubric_json = COALESCE(?, rubric_json),
          updated_at = ?
      WHERE id = ? AND lesson_unit_id = ?
    `);

    const updateLessonUnit = this.database.query<
      undefined,
      SQLQueryBindings[]
    >(updateLessonUnitQuery);
    const touchUpdatedAtOnly = this.database.query<undefined, [string, string]>(`
      UPDATE lesson_units
      SET updated_at = ?
      WHERE id = ?
    `);

    this.database.transaction(() => {
      if (setSegments.length > 0) {
        values.push(lessonUnitId);
        updateLessonUnit.run(...values);
      } else {
        touchUpdatedAtOnly.run(now, lessonUnitId);
      }

      if (hasCheckpointReplacements) {
        this.replaceUnitCheckpoints(
          lessonUnitId,
          patch.checkpointReplacements ?? [],
          now,
        );
      } else if (hasCheckpointPatches) {
        for (const checkpointPatch of patch.checkpointPatches ?? []) {
          const patchValues: SQLQueryBindings[] = [
            checkpointPatch.promptMd ?? null,
            checkpointPatch.expectedAnswerMd ?? null,
            checkpointPatch.rubric
              ? JSON.stringify(checkpointPatch.rubric)
              : null,
            now,
            checkpointPatch.checkpointId,
            lessonUnitId,
          ];

          checkpointPatchQuery.run(...patchValues);
        }
      }
    })();

    const updated = await this.findLessonUnitById(lessonUnitId);

    if (!updated) {
      return null;
    }

    return updated;
  }

  async replaceLessonUnitById(
    lessonUnitId: string,
    replacement: {
      generationRunId: string;
      title: string;
      learningObjective: string;
      conceptKeys: string[];
      sourceAnchors: SourceAnchor[];
      explanationMd: string;
      intuitionMd: string;
      notationMd?: string | null;
      exampleMd?: string | null;
      misconceptionMd?: string | null;
      reviewerNotes?: string | null;
      checkpoints: LessonGenerationCheckpoint[];
      reviewStatus?: ReviewStatus;
    },
  ): Promise<LessonUnitResponse | null> {
    const existing = await this.findLessonUnitById(lessonUnitId);

    if (!existing) {
      return null;
    }

    const lessonUnitUpdate = this.database.query<undefined, SQLQueryBindings[]>(`
      UPDATE lesson_units
      SET
        generation_run_id = ?,
        title = ?,
        learning_objective = ?,
        concept_keys_json = ?,
        source_anchors_json = ?,
        explanation_md = ?,
        intuition_md = ?,
        notation_md = ?,
        example_md = ?,
        misconception_md = ?,
        review_status = ?,
        reviewer_notes = ?,
        updated_at = ?
      WHERE id = ?
    `,
    );

    const updatedAt = new Date().toISOString();

    this.database.transaction(() => {
      lessonUnitUpdate.run(
        replacement.generationRunId,
        replacement.title,
        replacement.learningObjective,
        JSON.stringify(replacement.conceptKeys),
        JSON.stringify(replacement.sourceAnchors),
        replacement.explanationMd,
        replacement.intuitionMd,
        replacement.notationMd ?? null,
        replacement.exampleMd ?? null,
        replacement.misconceptionMd ?? null,
        replacement.reviewStatus ?? existing.reviewStatus,
        replacement.reviewerNotes ?? existing.reviewerNotes ?? null,
        updatedAt,
        lessonUnitId,
      );

      this.replaceUnitCheckpoints(lessonUnitId, replacement.checkpoints, updatedAt);
    })();

    return this.findLessonUnitById(lessonUnitId);
  }
}
