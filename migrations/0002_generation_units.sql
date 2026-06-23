CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY,
  chapter_source_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
  input_summary TEXT NOT NULL,
  raw_output_json TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (chapter_source_id) REFERENCES chapter_sources(id)
);

CREATE INDEX IF NOT EXISTS generation_runs_chapter_source_id_idx
  ON generation_runs(chapter_source_id);

CREATE TABLE IF NOT EXISTS lesson_units (
  id TEXT PRIMARY KEY,
  chapter_source_id TEXT NOT NULL,
  generation_run_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  learning_objective TEXT NOT NULL,
  concept_keys_json TEXT NOT NULL,
  source_anchors_json TEXT NOT NULL,
  explanation_md TEXT NOT NULL,
  intuition_md TEXT NOT NULL,
  notation_md TEXT,
  example_md TEXT,
  misconception_md TEXT,
  review_status TEXT NOT NULL CHECK(
    review_status IN ('draft', 'approved', 'rejected', 'needs_regeneration')
  ),
  reviewer_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chapter_source_id) REFERENCES chapter_sources(id),
  FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id)
);

CREATE INDEX IF NOT EXISTS lesson_units_chapter_source_id_idx
  ON lesson_units(chapter_source_id);

CREATE INDEX IF NOT EXISTS lesson_units_generation_run_id_idx
  ON lesson_units(generation_run_id);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  lesson_unit_id TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  prompt_md TEXT NOT NULL,
  expected_answer_md TEXT NOT NULL,
  rubric_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id)
);

CREATE INDEX IF NOT EXISTS checkpoints_lesson_unit_id_idx
  ON checkpoints(lesson_unit_id);
