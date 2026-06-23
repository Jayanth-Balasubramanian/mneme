# AI-Assisted Technical Book Study

This context defines the product language for the technical-book study app. Use these terms consistently in specs, implementation, tests, and agent handoffs.

## Language

**Chapter Source**:
A single Markdown excerpt from a technical book chapter, including metadata and source text used to generate study material.
_Avoid_: Book, document, upload

**Lesson Draft**:
AI-generated study material that has not yet been approved for studying.
_Avoid_: Final lesson, card set

**Lesson Unit**:
One ordered part of a guided lesson, pairing explanation, intuition, notation or examples, and one or more checkpoints for a focused concept.
_Avoid_: Card, slide, page

**Guided Lesson Path**:
The ordered learner-facing sequence of approved lesson units and checkpoints used for studying a chapter source.
_Avoid_: Course, deck, playlist

**Checkpoint**:
An active-recall prompt attached to a lesson unit, with an expected answer and rubric for self-assessment.
_Avoid_: Quiz, test, exam question

**Review**:
The human approval workflow that edits, approves, rejects, or marks generated lesson units for regeneration before studying.
_Avoid_: Moderation, publishing

**Regeneration**:
The AI-assisted replacement of a single lesson unit during review, using that unit's source anchors, concept keys, and reviewer notes.
_Avoid_: Full rerun, rebuild

**Study Attempt**:
A user's answer to a checkpoint plus self-rating, confidence, and timestamp.
_Avoid_: Response, submission

**Weak Concept**:
A concept key with evidence of misunderstanding from wrong or partial study attempts.
_Avoid_: Failed card, bad topic

**Remediation Variant**:
A future alternative explanation or checkpoint generated for a weak concept.
_Avoid_: Repetition, duplicate card

**Source Anchor**:
A reference from generated study material back to the relevant location in the chapter source.
_Avoid_: Citation, link
