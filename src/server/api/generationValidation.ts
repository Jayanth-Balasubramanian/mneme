import type { SourceAnchor } from "../../shared/source";
import type { ValidationIssue } from "../../shared/generation";

function sameHeadingPath(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function validateSourceAnchorAgainstChapter(
  unitsAnchorPath: string,
  chapterAnchorsByParagraph: Map<number, SourceAnchor>,
  chapterSourceUrl: string,
  sourceAnchor: SourceAnchor,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (sourceAnchor.sourceUrl !== chapterSourceUrl) {
    issues.push({
      field: `${unitsAnchorPath}.sourceUrl`,
      message: "Source anchor sourceUrl must match the imported chapter sourceUrl.",
    });
    return issues;
  }

  for (
    let paragraph = sourceAnchor.paragraphStart;
    paragraph <= sourceAnchor.paragraphEnd;
    paragraph += 1
  ) {
    const chapterAnchor = chapterAnchorsByParagraph.get(paragraph);

    if (!chapterAnchor) {
      issues.push({
        field: `${unitsAnchorPath}.paragraphStart`,
        message:
          "Source anchor paragraph range must match the current chapter source anchors.",
      });
      return issues;
    }

    if (!sameHeadingPath(chapterAnchor.headingPath, sourceAnchor.headingPath)) {
      issues.push({
        field: `${unitsAnchorPath}.headingPath`,
        message:
          "Source anchor headingPath must align with chapter-derived source anchors.",
      });
      return issues;
    }
  }

  return issues;
}

export function validateGeneratedAnchorsBelongToChapter(
  units: Array<{ sourceAnchors: SourceAnchor[] }>,
  chapterContext: {
    sourceUrl: string;
    anchors: SourceAnchor[];
  },
): ValidationIssue[] {
  const chapterAnchorsByParagraph = new Map<number, SourceAnchor>();

  for (const chapterAnchor of chapterContext.anchors) {
    if (chapterAnchor.sourceUrl !== chapterContext.sourceUrl) {
      continue;
    }

    chapterAnchorsByParagraph.set(chapterAnchor.paragraphStart, chapterAnchor);
  }

  const issues: ValidationIssue[] = [];

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];

    for (let anchorIndex = 0; anchorIndex < unit.sourceAnchors.length; anchorIndex += 1) {
      const sourceAnchor = unit.sourceAnchors[anchorIndex];
      const anchorPath = `units[${unitIndex}].sourceAnchors[${anchorIndex}]`;

      issues.push(
        ...validateSourceAnchorAgainstChapter(
          anchorPath,
          chapterAnchorsByParagraph,
          chapterContext.sourceUrl,
          sourceAnchor,
        ),
      );
    }
  }

  return issues;
}
