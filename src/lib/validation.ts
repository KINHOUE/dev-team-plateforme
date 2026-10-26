/**
 * Validation partagée, testable hors du routeur.
 */

/** Vrai si la valeur est un UUID v1–v5 bien formé. */
export function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Tronque proprement une chaîne destinée à un titre. */
export function toTitle(value: string, max = 80): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  // « … » occupe un seul caractère : on réserve 1 place, pas 3
  return clean.slice(0, max - 1) + "…";
}
