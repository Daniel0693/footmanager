import { computeOccurrenceDates, MAX_OCCURRENCES, type RecurrenceRule } from "./recurrence";

// Formate en heure LOCALE (pas toISOString, qui convertit en UTC et décale
// d'un jour selon le fuseau de la machine qui exécute les tests).
function iso(dates: Date[]) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return dates.map(
    (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  );
}

describe("computeOccurrenceDates", () => {
  describe("weekly", () => {
    it("retourne les jours de semaine sélectionnés dans la plage (lundi/mercredi/vendredi)", () => {
      const rule: RecurrenceRule = { type: "weekly", weekdays: [0, 2, 4] };
      const dates = computeOccurrenceDates(
        rule,
        new Date(2026, 6, 6), // lundi 6 juillet 2026
        new Date(2026, 6, 12), // dimanche 12 juillet 2026
      );

      expect(iso(dates)).toEqual(["2026-07-06", "2026-07-08", "2026-07-10"]);
    });

    it("aucun jour sélectionné : aucune occurrence", () => {
      const rule: RecurrenceRule = { type: "weekly", weekdays: [] };
      const dates = computeOccurrenceDates(rule, new Date(2026, 6, 6), new Date(2026, 6, 12));
      expect(dates).toEqual([]);
    });

    it("plage inversée : aucune occurrence", () => {
      const rule: RecurrenceRule = { type: "weekly", weekdays: [0] };
      const dates = computeOccurrenceDates(rule, new Date(2026, 6, 12), new Date(2026, 6, 6));
      expect(dates).toEqual([]);
    });
  });

  describe("monthly — jour fixe du mois", () => {
    it("le 6 de chaque mois entre janvier et juin 2026", () => {
      const rule: RecurrenceRule = { type: "monthly", mode: "dayOfMonth", dayOfMonth: 6 };
      const dates = computeOccurrenceDates(rule, new Date(2026, 0, 1), new Date(2026, 5, 30));

      expect(iso(dates)).toEqual([
        "2026-01-06",
        "2026-02-06",
        "2026-03-06",
        "2026-04-06",
        "2026-05-06",
        "2026-06-06",
      ]);
    });

    it("le 31 du mois : ignore les mois qui n'ont pas 31 jours (pas de débordement sur le mois suivant)", () => {
      const rule: RecurrenceRule = { type: "monthly", mode: "dayOfMonth", dayOfMonth: 31 };
      const dates = computeOccurrenceDates(rule, new Date(2026, 0, 1), new Date(2026, 3, 30));

      // Janvier (31j) et mars (31j) seulement — février (28j) et avril (30j) sautés.
      expect(iso(dates)).toEqual(["2026-01-31", "2026-03-31"]);
    });
  });

  describe("monthly — Nième jour de semaine du mois", () => {
    it("1er vendredi de chaque mois : toujours un vendredi dans les 7 premiers jours du mois", () => {
      const rule: RecurrenceRule = {
        type: "monthly",
        mode: "weekdayOrdinal",
        ordinal: 1,
        weekday: 4, // vendredi
      };
      const dates = computeOccurrenceDates(rule, new Date(2026, 0, 1), new Date(2026, 5, 30));

      expect(dates).toHaveLength(6);
      for (const date of dates) {
        expect(((date.getDay() + 6) % 7)).toBe(4);
        expect(date.getDate()).toBeLessThanOrEqual(7);
      }
    });

    it("dernier vendredi de chaque mois : toujours un vendredi, la semaine suivante change de mois", () => {
      const rule: RecurrenceRule = {
        type: "monthly",
        mode: "weekdayOrdinal",
        ordinal: -1,
        weekday: 4,
      };
      const dates = computeOccurrenceDates(rule, new Date(2026, 0, 1), new Date(2026, 2, 31));

      expect(dates).toHaveLength(3);
      for (const date of dates) {
        expect(((date.getDay() + 6) % 7)).toBe(4);
        const nextWeek = new Date(date);
        nextWeek.setDate(nextWeek.getDate() + 7);
        expect(nextWeek.getMonth()).not.toBe(date.getMonth());
      }
    });
  });

  describe("yearly — date fixe", () => {
    it("le 12 février chaque année", () => {
      const rule: RecurrenceRule = { type: "yearly", mode: "fixedDate", month: 2, day: 12 };
      const dates = computeOccurrenceDates(rule, new Date(2025, 0, 1), new Date(2027, 11, 31));

      expect(iso(dates)).toEqual(["2025-02-12", "2026-02-12", "2027-02-12"]);
    });

    it("le 29 février : ignore les années non bissextiles", () => {
      const rule: RecurrenceRule = { type: "yearly", mode: "fixedDate", month: 2, day: 29 };
      const dates = computeOccurrenceDates(rule, new Date(2023, 0, 1), new Date(2026, 11, 31));

      // Seule 2024 est bissextile dans cette plage.
      expect(iso(dates)).toEqual(["2024-02-29"]);
    });
  });

  describe("yearly — Nième jour de semaine d'un mois", () => {
    it("dernier vendredi de janvier chaque année", () => {
      const rule: RecurrenceRule = {
        type: "yearly",
        mode: "weekdayOrdinal",
        ordinal: -1,
        weekday: 4,
        month: 1,
      };
      const dates = computeOccurrenceDates(rule, new Date(2025, 0, 1), new Date(2027, 11, 31));

      expect(dates).toHaveLength(3);
      for (const date of dates) {
        expect(date.getMonth()).toBe(0);
        expect(((date.getDay() + 6) % 7)).toBe(4);
      }
    });
  });

  it("plafonne le nombre d'occurrences générées (garde-fou, même borne que le backend)", () => {
    const rule: RecurrenceRule = { type: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6] };
    const dates = computeOccurrenceDates(rule, new Date(2020, 0, 1), new Date(2030, 0, 1));

    expect(dates.length).toBeLessThanOrEqual(MAX_OCCURRENCES + 1);
  });
});
