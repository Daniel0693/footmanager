import {
  LINE_POSITIONS,
  lineForPosition,
  POSITIONS,
  POSITION_LINES,
} from "./positions";

describe("positions", () => {
  it("chaque poste de POSITIONS apparaît dans exactement une ligne de LINE_POSITIONS", () => {
    for (const position of POSITIONS) {
      const lines = POSITION_LINES.filter((line) =>
        LINE_POSITIONS[line].includes(position),
      );
      expect(lines).toHaveLength(1);
    }
  });

  it("LINE_POSITIONS ne contient aucun poste hors de POSITIONS", () => {
    const allGrouped = POSITION_LINES.flatMap((line) => LINE_POSITIONS[line]);
    for (const position of allGrouped) {
      expect(POSITIONS).toContain(position);
    }
    // Et rien n'est dupliqué entre lignes ni omis.
    expect(allGrouped.sort()).toEqual([...POSITIONS].sort());
  });

  it("lineForPosition renvoie la bonne ligne pour un échantillon de postes", () => {
    expect(lineForPosition("GK")).toBe("GK");
    expect(lineForPosition("CB")).toBe("DEF");
    expect(lineForPosition("RWB")).toBe("DEF");
    expect(lineForPosition("CDM")).toBe("MID");
    expect(lineForPosition("CAM")).toBe("MID");
    expect(lineForPosition("ST")).toBe("ATT");
    expect(lineForPosition("LW")).toBe("ATT");
  });
});
