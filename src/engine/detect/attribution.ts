import type { EntitySpan } from "./mentions";
import { segment, type Unit } from "../tone/segment";

export interface AttributedUnit extends Unit {
  /** Entity spans that fall inside this unit, in order. */
  spans: EntitySpan[];
  /**
   * For units naming no company: the entity the sentence refers back to ("It was founded in 2009.",
   * "Even so, it's the one I'd pick."). Null when there is nothing in the same paragraph to refer to.
   */
  referent: string | null;
}

const BACK_REFERENCE = /\b(?:it|it's|its|they|their|the company|this one|the platform|the vendor)\b/i;

/** Split an answer into units and work out which company each one talks about. */
export function attributeUnits(text: string, spans: EntitySpan[]): AttributedUnit[] {
  let lastEntity: string | null = null;
  let lastParagraph = -1;
  return segment(text).map((unit) => {
    if (unit.paragraph !== lastParagraph) {
      lastEntity = null;
      lastParagraph = unit.paragraph;
    }
    const inside = spans.filter((s) => s.start >= unit.start && s.end <= unit.end);
    const referent = inside.length === 0 ? lastEntity : null;
    if (inside.length) lastEntity = inside[inside.length - 1].entity;
    return { ...unit, spans: inside, referent };
  });
}

/** True when a company-free sentence plausibly refers back to the previous company. */
export function refersBack(unit: AttributedUnit): boolean {
  return unit.referent !== null && BACK_REFERENCE.test(unit.text);
}

/**
 * The entity a claim at character `at` belongs to: the nearest company named before it in the same
 * sentence, else the first one after it, else the sentence's back-reference.
 */
export function entityAt(unit: AttributedUnit, at: number): string | null {
  const before = unit.spans.filter((s) => s.start <= at);
  if (before.length) return before[before.length - 1].entity;
  if (unit.spans.length) return unit.spans[0].entity;
  return unit.referent;
}
