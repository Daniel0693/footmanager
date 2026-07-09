import { computeYearlyOccurrences } from './yearly-occurrence';

describe('computeYearlyOccurrences', () => {
  it("renvoie l'occurrence de l'année si elle tombe dans la plage", () => {
    const birthDate = new Date('2010-07-08T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );

    expect(result).toHaveLength(1);
    expect(result[0].getFullYear()).toBe(2026);
    expect(result[0].getMonth()).toBe(6);
    expect(result[0].getDate()).toBe(8);
  });

  it('renvoie une occurrence par année couverte par la plage', () => {
    const birthDate = new Date('2010-07-08T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2025, 0, 1),
      new Date(2027, 11, 31),
    );

    expect(result.map((d) => d.getFullYear())).toEqual([2025, 2026, 2027]);
  });

  it('renvoie un tableau vide si aucune occurrence ne tombe dans la plage', () => {
    const birthDate = new Date('2010-07-08T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2026, 0, 1),
      new Date(2026, 5, 30),
    );

    expect(result).toEqual([]);
  });

  it('gère le 29 février : pas d’occurrence une année non bissextile', () => {
    const birthDate = new Date('2000-02-29T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
    );

    expect(result).toEqual([]);
  });

  it('gère le 29 février : occurrence présente une année bissextile', () => {
    const birthDate = new Date('2000-02-29T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2028, 0, 1),
      new Date(2028, 11, 31),
    );

    expect(result).toHaveLength(1);
    expect(result[0].getMonth()).toBe(1);
    expect(result[0].getDate()).toBe(29);
  });

  it('gère une plage à cheval sur un changement d’année', () => {
    const birthDate = new Date('2010-01-05T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2025, 11, 20),
      new Date(2026, 0, 10),
    );

    expect(result).toHaveLength(1);
    expect(result[0].getFullYear()).toBe(2026);
    expect(result[0].getMonth()).toBe(0);
    expect(result[0].getDate()).toBe(5);
  });

  it('renvoie un tableau vide si la plage est inversée', () => {
    const birthDate = new Date('2010-07-08T00:00:00.000Z');
    const result = computeYearlyOccurrences(
      birthDate,
      new Date(2026, 11, 31),
      new Date(2026, 0, 1),
    );

    expect(result).toEqual([]);
  });
});
