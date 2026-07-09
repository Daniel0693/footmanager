import {
  addDays,
  assignLanes,
  endOfDay,
  getIsoWeekNumber,
  isMultiDay,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDayKey,
} from "./calendar-grid";

describe("isSameDay", () => {
  it("vrai pour deux dates du même jour à des heures différentes", () => {
    expect(isSameDay(new Date(2026, 6, 10, 8, 0), new Date(2026, 6, 10, 23, 59))).toBe(true);
  });

  it("faux pour deux dates de jours différents", () => {
    expect(isSameDay(new Date(2026, 6, 10), new Date(2026, 6, 11))).toBe(false);
  });
});

describe("toDayKey", () => {
  it("deux dates du même jour produisent la même clé", () => {
    expect(toDayKey(new Date(2026, 6, 10, 8, 0))).toBe(toDayKey(new Date(2026, 6, 10, 23, 0)));
  });

  it("deux jours différents produisent des clés différentes", () => {
    expect(toDayKey(new Date(2026, 6, 10))).not.toBe(toDayKey(new Date(2026, 6, 11)));
  });
});

describe("addDays", () => {
  it("avance de N jours, y compris à travers un changement de mois", () => {
    expect(addDays(new Date(2026, 6, 30), 3)).toEqual(new Date(2026, 7, 2));
  });

  it("recule avec un delta négatif", () => {
    expect(addDays(new Date(2026, 6, 2), -3)).toEqual(new Date(2026, 5, 29));
  });
});

describe("startOfDay / endOfDay", () => {
  it("startOfDay met l'heure à 00:00:00.000", () => {
    const result = startOfDay(new Date(2026, 6, 10, 15, 30, 45, 500));
    expect([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("endOfDay met l'heure à 23:59:59.999", () => {
    const result = endOfDay(new Date(2026, 6, 10, 8, 0));
    expect([result.getHours(), result.getMinutes(), result.getSeconds(), result.getMilliseconds()]).toEqual([
      23, 59, 59, 999,
    ]);
  });
});

describe("startOfWeek", () => {
  it("un dimanche retombe sur le lundi précédent (convention française)", () => {
    // 2026-07-12 est un dimanche.
    expect(startOfWeek(new Date(2026, 6, 12))).toEqual(new Date(2026, 6, 6));
  });

  it("un lundi est son propre début de semaine", () => {
    // 2026-07-06 est un lundi.
    expect(startOfWeek(new Date(2026, 6, 6))).toEqual(new Date(2026, 6, 6));
  });
});

describe("isMultiDay", () => {
  it("faux si endAt est null", () => {
    expect(isMultiDay({ startAt: "2026-07-10T08:00:00.000Z", endAt: null })).toBe(false);
  });

  it("faux si startAt et endAt sont le même jour calendaire", () => {
    expect(
      isMultiDay({
        startAt: "2026-07-10T08:00:00.000Z",
        endAt: "2026-07-10T18:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("vrai si startAt et endAt sont des jours calendaires différents", () => {
    expect(
      isMultiDay({
        startAt: "2026-07-10T08:00:00.000Z",
        endAt: "2026-07-12T18:00:00.000Z",
      }),
    ).toBe(true);
  });
});

describe("getIsoWeekNumber", () => {
  it("le 4 janvier est toujours en semaine ISO 1 (définition de la norme)", () => {
    expect(getIsoWeekNumber(new Date(2024, 0, 4))).toBe(1);
    expect(getIsoWeekNumber(new Date(2025, 0, 4))).toBe(1);
    expect(getIsoWeekNumber(new Date(2026, 0, 4))).toBe(1);
  });

  it("avancer d'exactement 7 jours incrémente le numéro de semaine de 1 (hors bascule d'année)", () => {
    const week = getIsoWeekNumber(new Date(2026, 5, 15));
    const nextWeek = getIsoWeekNumber(addDays(new Date(2026, 5, 15), 7));
    expect(nextWeek).toBe(week + 1);
  });
});

describe("assignLanes", () => {
  interface Item {
    id: number;
    start: number;
    end: number;
  }
  const opts = {
    id: (item: Item) => item.id,
    start: (item: Item) => item.start,
    end: (item: Item) => item.end,
  };

  it("deux éléments disjoints partagent la voie 0", () => {
    const result = assignLanes<Item>(
      [
        { id: 1, start: 0, end: 1 },
        { id: 2, start: 2, end: 3 },
      ],
      { ...opts, reuseWhenTouching: false },
    );

    expect(result.get(1)).toEqual({ lane: 0, laneCount: 1 });
    expect(result.get(2)).toEqual({ lane: 0, laneCount: 1 });
  });

  it("deux éléments qui se chevauchent reçoivent des voies distinctes", () => {
    const result = assignLanes<Item>(
      [
        { id: 1, start: 0, end: 2 },
        { id: 2, start: 1, end: 3 },
      ],
      { ...opts, reuseWhenTouching: false },
    );

    expect(result.get(1)).toEqual({ lane: 0, laneCount: 2 });
    expect(result.get(2)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("reuseWhenTouching=false : deux éléments qui se touchent exactement ne partagent pas la voie", () => {
    const result = assignLanes<Item>(
      [
        { id: 1, start: 0, end: 1 },
        { id: 2, start: 1, end: 2 },
      ],
      { ...opts, reuseWhenTouching: false },
    );

    expect(result.get(1)).toEqual({ lane: 0, laneCount: 2 });
    expect(result.get(2)).toEqual({ lane: 1, laneCount: 2 });
  });

  it("reuseWhenTouching=true : deux éléments qui se touchent exactement partagent la voie", () => {
    const result = assignLanes<Item>(
      [
        { id: 1, start: 0, end: 1 },
        { id: 2, start: 1, end: 2 },
      ],
      { ...opts, reuseWhenTouching: true },
    );

    expect(result.get(1)).toEqual({ lane: 0, laneCount: 1 });
    expect(result.get(2)).toEqual({ lane: 0, laneCount: 1 });
  });

  it("une voie libérée est réutilisée par un élément suivant qui ne chevauche plus l'occupant d'origine", () => {
    // A(0-1) et B(0-5) se chevauchent (voies distinctes). C(2-3) ne
    // chevauche plus A (déjà terminé) mais chevauche encore B — doit donc
    // réutiliser la voie de A, pas en ouvrir une troisième.
    const result = assignLanes<Item>(
      [
        { id: 1, start: 0, end: 1 }, // A
        { id: 2, start: 0, end: 5 }, // B
        { id: 3, start: 2, end: 3 }, // C
      ],
      { ...opts, reuseWhenTouching: false },
    );

    expect(result.get(1)).toEqual({ lane: 0, laneCount: 2 });
    expect(result.get(2)).toEqual({ lane: 1, laneCount: 2 });
    expect(result.get(3)).toEqual({ lane: 0, laneCount: 2 });
  });

  it("une liste vide renvoie une Map vide", () => {
    const result = assignLanes<Item>([], { ...opts, reuseWhenTouching: false });
    expect(result.size).toBe(0);
  });
});
