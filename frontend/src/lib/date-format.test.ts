import { formatDate } from "./date-format";

describe("formatDate", () => {
  it("formate une date ISO en JJ/MM/AAAA", () => {
    expect(formatDate("2011-10-30T00:00:00.000Z")).toBe("30/10/2011");
  });

  it("zéro-remplit le jour et le mois", () => {
    expect(formatDate("2025-01-05T00:00:00.000Z")).toBe("05/01/2025");
  });

  it("accepte un objet Date", () => {
    expect(formatDate(new Date("2025-09-05T00:00:00.000Z"))).toBe("05/09/2025");
  });
});
