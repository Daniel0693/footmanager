const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}));

import {
  fetchBirthdayEvents,
  fetchCalendarEvents,
  isEmptyFilterSelection,
  isFiltersReady,
  type EventFilters,
} from "./calendar-events-api";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

function filters(overrides: Partial<EventFilters> = {}): EventFilters {
  return {
    types: new Set(["TRAINING", "MATCH"]),
    teamIds: new Set([5, 6]),
    showBirthdays: true,
    ...overrides,
  };
}

describe("isFiltersReady", () => {
  it("faux tant que teamIds est null (\"mes équipes\" pas encore chargé)", () => {
    expect(isFiltersReady(filters({ teamIds: null }))).toBe(false);
  });

  it("vrai dès que teamIds est un Set, même vide", () => {
    expect(isFiltersReady(filters({ teamIds: new Set() }))).toBe(true);
  });
});

describe("isEmptyFilterSelection", () => {
  it("vrai si aucun type n'est sélectionné", () => {
    expect(isEmptyFilterSelection(filters({ types: new Set() }))).toBe(true);
  });

  it("vrai si aucune équipe n'est sélectionnée (Set vide)", () => {
    expect(isEmptyFilterSelection(filters({ teamIds: new Set() }))).toBe(true);
  });

  it("faux si au moins un type et une équipe sont sélectionnés", () => {
    expect(isEmptyFilterSelection(filters())).toBe(false);
  });

  it("faux si teamIds est encore null (pas encore chargé, différent d'un Set vide)", () => {
    expect(isEmptyFilterSelection(filters({ teamIds: null }))).toBe(false);
  });
});

describe("fetchCalendarEvents", () => {
  const range = {
    dateFrom: new Date("2026-07-01T00:00:00.000Z"),
    dateTo: new Date("2026-07-31T23:59:59.999Z"),
  };

  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  it("construit la query (types/teamIds joints par virgule, dates ISO, tri par défaut asc)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    await fetchCalendarEvents("1", "token", filters(), range);

    const [url, options] = mockApiFetch.mock.calls[0];
    const query = queryOf(url);
    expect(url.startsWith("/clubs/1/events/mine?")).toBe(true);
    expect(["TRAINING,MATCH", "MATCH,TRAINING"]).toContain(query.get("types"));
    expect(["5,6", "6,5"]).toContain(query.get("teamIds"));
    expect(query.get("dateFrom")).toBe(range.dateFrom.toISOString());
    expect(query.get("dateTo")).toBe(range.dateTo.toISOString());
    expect(query.get("sortOrder")).toBe("asc");
    expect(options).toEqual({ headers: { Authorization: "Bearer token" } });
  });

  it("respecte un sortOrder explicite", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    await fetchCalendarEvents("1", "token", filters(), { ...range, sortOrder: "desc" });

    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("sortOrder")).toBe("desc");
  });

  it("omet teamIds de la query quand il est null", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    await fetchCalendarEvents("1", "token", filters({ teamIds: null }), range);

    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).has("teamIds")).toBe(false);
  });

  it("renvoie les événements reçus quand la réponse est ok", async () => {
    const events = [{ id: 1 }];
    mockApiFetch.mockResolvedValue(jsonResponse(events));

    const result = await fetchCalendarEvents("1", "token", filters(), range);

    expect(result).toBe(events);
  });

  it("lève une erreur quand la réponse n'est pas ok", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    await expect(fetchCalendarEvents("1", "token", filters(), range)).rejects.toThrow();
  });
});

describe("fetchBirthdayEvents", () => {
  const range = {
    dateFrom: new Date("2026-07-01T00:00:00.000Z"),
    dateTo: new Date("2026-07-31T23:59:59.999Z"),
  };

  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  it("appelle l'endpoint members/birthdays avec la fenêtre de dates et les équipes", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    await fetchBirthdayEvents("1", "token", range, new Set([5, 6]));

    const [url] = mockApiFetch.mock.calls[0];
    expect(url.startsWith("/clubs/1/members/birthdays?")).toBe(true);
    const query = queryOf(url);
    expect(["5,6", "6,5"]).toContain(query.get("teamIds"));
    expect(query.get("dateFrom")).toBe(range.dateFrom.toISOString());
    expect(query.get("dateTo")).toBe(range.dateTo.toISOString());
  });

  it("omet teamIds de la query quand il est null (scope club entier)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    await fetchBirthdayEvents("1", "token", range, null);

    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).has("teamIds")).toBe(false);
  });

  it("lève une erreur quand la réponse n'est pas ok", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    await expect(fetchBirthdayEvents("1", "token", range, null)).rejects.toThrow();
  });
});
