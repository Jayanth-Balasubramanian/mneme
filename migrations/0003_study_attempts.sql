CREATE TABLE IF NOT EXISTS study_attempts (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  lesson_unit_id TEXT NOT NULL,
  answer_md TEXT NOT NULL,
  self_rating TEXT NOT NULL CHECK(self_rating IN ('wrong', 'partial', 'correct')),
  confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
  concept_keys_json TEXT NOT NULL,
  source_anchors_json TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id)
);

CREATE TABLE IF NOT EXISTS concept_events (
  id TEXT PRIMARY KEY,
  lesson_unit_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  concept_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
);

CREATE INDEX IF NOT EXISTS study_attempts_checkpoint_id_idx
  ON study_attempts(checkpoint_id);

CREATE INDEX IF NOT EXISTS study_attempts_lesson_unit_id_idx
  ON study_attempts(lesson_unit_id);

CREATE INDEX IF NOT EXISTS concept_events_lesson_unit_id_idx
  ON concept_events(lesson_unit_id);

CREATE INDEX IF NOT EXISTS concept_events_checkpoint_id_idx
  ON concept_events(checkpoint_id);

CREATE INDEX IF NOT EXISTS concept_events_chapter_source_idx
  ON concept_events(concept_key, lesson_unit_id);
