import { describe, expect, it } from "vitest";

import { isUuid, toTitle } from "@/lib/validation";
import { COLUMNS } from "@/lib/team";

describe("isUuid", () => {
  it("accepte un UUID v4 valide", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("rejette une chaîne quelconque", () => {
    expect(isUuid("pas-un-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("rejette des types non textuels", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid({})).toBe(false);
  });

  it("rejette un UUID tronqué ou trop long", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c")).toBe(false);
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301-extra")).toBe(false);
  });
});

describe("toTitle", () => {
  it("laisse intact un texte court", () => {
    expect(toTitle("Créer une app de réservation")).toBe("Créer une app de réservation");
  });

  it("tronque avec une ellipse au-delà de la limite", () => {
    const long = "a".repeat(120);
    const out = toTitle(long, 80);
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
  });

  it("supprime les espaces superflus", () => {
    expect(toTitle("   bonjour   ")).toBe("bonjour");
  });
});

describe("colonnes du board", () => {
  it("respecte l'ordre du pipeline", () => {
    expect(COLUMNS).toEqual(["À faire", "En cours", "Revue QA", "Audit sécu", "Terminé"]);
  });

  it("se termine par Terminé (statut qui libère le quota)", () => {
    expect(COLUMNS[COLUMNS.length - 1]).toBe("Terminé");
  });
});
