import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { EVENT_TYPES } from "@/lib/event";
import { CalendarListView } from "./calendar-list-view";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const teams = [{ id: 5, name: "U15 A" }];
const allTypesFilters = { types: new Set(EVENT_TYPES), teamIds: new Set([5]), showBirthdays: false };

function eventItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "MATCH",
    title: "Match amical",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: null,
    location: null,
    description: null,
    isRecurring: false,
    team: teams[0],
    ...overrides,
  };
}

describe("CalendarListView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    jest.useFakeTimers().setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("charge une fenêtre initiale centrée sur aujourd'hui (14 jours avant, 60 jours après)", async () => {
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    const dateFrom = new Date(query.get("dateFrom")!);
    const dateTo = new Date(query.get("dateTo")!);
    const today = new Date("2026-07-10T12:00:00.000Z");
    const daysBefore = Math.round((today.getTime() - dateFrom.getTime()) / 86_400_000);
    const daysAfter = Math.round((dateTo.getTime() - today.getTime()) / 86_400_000);
    expect(daysBefore).toBe(14);
    expect(daysAfter).toBe(60);
  });

  it("sélection de filtre vide : liste vide sans appel réseau", async () => {
    renderWithIntl(
      <CalendarListView
        clubId="1"
        teams={teams}
        filters={{ types: new Set(), teamIds: new Set([5]), showBirthdays: false }}
        refreshKey={0}
        recenterKey={0}
      />,
    );

    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche les événements reçus", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );

    expect(await screen.findByText("Match amical")).toBeInTheDocument();
  });

  it("scroll près du haut charge les événements plus anciens et les ajoute au début", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 2, title: "Ancien match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 50; // < seuil de 200px : proche du haut

    fireEvent.scroll(container);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    // La borne passée (14 jours avant aujourd'hui) devient le dateTo exclusif
    // du bloc plus ancien chargé (30 jours de plus).
    const dateFrom = new Date(query.get("dateFrom")!);
    const initialPastBoundary = new Date("2026-06-26T12:00:00.000Z"); // aujourd'hui - 14j
    const daysEarlier = Math.round(
      (initialPastBoundary.getTime() - dateFrom.getTime()) / 86_400_000,
    );
    expect(daysEarlier).toBe(30);
    expect(await screen.findByText("Ancien match")).toBeInTheDocument();
    expect(screen.getByText("Match amical")).toBeInTheDocument();
  });

  it("scroll près du bas charge les événements futurs et les ajoute à la fin", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 3, title: "Futur match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 550; // scrollHeight - clientHeight - scrollTop = 50 < seuil

    fireEvent.scroll(container);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Futur match")).toBeInTheDocument();
  });

  it("supprime un événement de la liste sans recharger toute la fenêtre", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockResolvedValue(jsonResponse(null));

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/events/1?scope=single",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
  });

  it("supprime un événement récurrent : propose le choix cet événement seulement / et les suivants", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse([eventItem({ id: 1, isRecurring: true })]),
    );
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockResolvedValue(jsonResponse(null));

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(
      screen.getByText(
        "Cet événement fait partie d'une série récurrente. Que souhaitez-vous supprimer ?",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cet événement et les suivants" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/events/1?scope=future",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("le bouton Aujourd'hui (recenterKey) abandonne la fenêtre étendue et revient à la fenêtre initiale", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    const { rerender } = renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");

    // Étend la fenêtre vers le passé (scroll).
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 50;
    fireEvent.scroll(container);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    rerender(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={1} />,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    const dateFrom = new Date(query.get("dateFrom")!);
    const today = new Date("2026-07-10T12:00:00.000Z");
    const daysBefore = Math.round((today.getTime() - dateFrom.getTime()) / 86_400_000);
    expect(daysBefore).toBe(14); // fenêtre initiale, pas la fenêtre étendue (44 jours)
  });

  describe("anniversaires", () => {
    function mockRoutes(events: unknown[], birthdays: unknown[]) {
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/members/birthdays")) return Promise.resolve(jsonResponse(birthdays));
        return Promise.resolve(jsonResponse(events));
      });
    }

    it("fusionne les anniversaires avec les événements dans la timeline, sans bouton d'édition/suppression", async () => {
      mockRoutes(
        [eventItem({ startAt: "2026-07-12T18:00:00.000Z" })],
        [{ memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-11T00:00:00.000Z", age: 14 }],
      );

      renderWithIntl(
        <CalendarListView
          clubId="1"
          teams={teams}
          filters={{ ...allTypesFilters, showBirthdays: true }}
          refreshKey={0}
          recenterKey={0}
        />,
      );

      expect(await screen.findByText("Léa Martin — 11/07/2026 — 14 ans")).toBeInTheDocument();
      expect(screen.getByText("Match amical")).toBeInTheDocument();
      const birthdayCard = screen.getByText("Léa Martin — 11/07/2026 — 14 ans").closest("li")!;
      expect(within(birthdayCard).queryByRole("button")).not.toBeInTheDocument();
    });

    it("ne charge pas les anniversaires quand le filtre est désactivé", async () => {
      mockRoutes([eventItem()], [
        { memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-11T00:00:00.000Z", age: 14 },
      ]);

      renderWithIntl(
        <CalendarListView
          clubId="1"
          teams={teams}
          filters={{ ...allTypesFilters, showBirthdays: false }}
          refreshKey={0}
          recenterKey={0}
        />,
      );

      await screen.findByText("Match amical");
      expect(
        mockApiFetch.mock.calls.some(([url]) => (url as string).includes("/members/birthdays")),
      ).toBe(false);
    });

    it("affiche les anniversaires même sans aucun type d'événement coché (sélection de types vide)", async () => {
      mockRoutes(
        [eventItem()],
        [{ memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-11T00:00:00.000Z", age: 14 }],
      );

      renderWithIntl(
        <CalendarListView
          clubId="1"
          teams={teams}
          filters={{ types: new Set(), teamIds: new Set([5]), showBirthdays: true }}
          refreshKey={0}
          recenterKey={0}
        />,
      );

      expect(await screen.findByText("Léa Martin — 11/07/2026 — 14 ans")).toBeInTheDocument();
      expect(screen.queryByText("Match amical")).not.toBeInTheDocument();
    });

    it("étend automatiquement la fenêtre (passé et futur) pour révéler des anniversaires hors de la fenêtre initiale, sélection de types vide", async () => {
      // Mock réaliste (filtré par dateFrom/dateTo, contrairement à
      // mockRoutes ci-dessus) : reproduit le bug signalé — 3 anniversaires
      // en base (1er avril, 8 juillet, 21 novembre), seul celui du 8 juillet
      // tombe dans la fenêtre initiale (26 juin – 8 septembre, aujourd'hui
      // étant le 10 juillet dans ce fichier de test).
      const allBirthdays = [
        { memberId: 1, firstName: "Avril", lastName: "Test", date: "2026-04-01T00:00:00.000Z", age: 10 },
        { memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-08T00:00:00.000Z", age: 14 },
        { memberId: 2, firstName: "Novembre", lastName: "Test", date: "2026-11-21T00:00:00.000Z", age: 33 },
      ];
      mockApiFetch.mockImplementation((url: string) => {
        if (!url.includes("/members/birthdays")) return Promise.resolve(jsonResponse([]));
        const query = new URL(url, "http://localhost").searchParams;
        const dateFrom = new Date(query.get("dateFrom")!);
        const dateTo = new Date(query.get("dateTo")!);
        return Promise.resolve(
          jsonResponse(
            allBirthdays.filter((b) => {
              const d = new Date(b.date);
              return d >= dateFrom && d <= dateTo;
            }),
          ),
        );
      });

      renderWithIntl(
        <CalendarListView
          clubId="1"
          teams={teams}
          filters={{ types: new Set(), teamIds: new Set([5]), showBirthdays: true }}
          refreshKey={0}
          recenterKey={0}
        />,
      );

      expect(await screen.findByText("Léa Martin — 08/07/2026 — 14 ans")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText("Avril Test — 01/04/2026 — 10 ans")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Novembre Test — 21/11/2026 — 33 ans")).toBeInTheDocument());
    });

    it("plusieurs clics rapprochés sur Aujourd'hui pendant l'extension automatique ne dédoublent pas les anniversaires", async () => {
      // Reproduit le bug signalé : un appel loadOlder/loadNewer du cycle
      // précédent, encore en vol au moment d'un nouveau clic "Aujourd'hui",
      // ne doit jamais réappliquer une fenêtre/donnée périmée (garde-fou
      // generationRef).
      const allBirthdays = [
        { memberId: 1, firstName: "Avril", lastName: "Test", date: "2026-04-01T00:00:00.000Z", age: 10 },
        { memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-08T00:00:00.000Z", age: 14 },
        { memberId: 2, firstName: "Novembre", lastName: "Test", date: "2026-11-21T00:00:00.000Z", age: 33 },
      ];
      mockApiFetch.mockImplementation((url: string) => {
        if (!url.includes("/members/birthdays")) return Promise.resolve(jsonResponse([]));
        const query = new URL(url, "http://localhost").searchParams;
        const dateFrom = new Date(query.get("dateFrom")!);
        const dateTo = new Date(query.get("dateTo")!);
        return Promise.resolve(
          jsonResponse(
            allBirthdays.filter((b) => {
              const d = new Date(b.date);
              return d >= dateFrom && d <= dateTo;
            }),
          ),
        );
      });

      const filters = { types: new Set<never>(), teamIds: new Set([5]), showBirthdays: true };
      const { rerender } = renderWithIntl(
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={0} />,
      );

      // Deux "clics" rapprochés (recenterKey incrémenté) sans attendre que
      // le cycle précédent (et son extension automatique) ait fini de
      // converger — exactement le scénario qui provoquait le doublon.
      rerender(
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={1} />,
      );
      rerender(
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={2} />,
      );

      await waitFor(() => expect(screen.getByText("Léa Martin — 08/07/2026 — 14 ans")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Avril Test — 01/04/2026 — 10 ans")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Novembre Test — 21/11/2026 — 33 ans")).toBeInTheDocument());
      // Aucun doublon : chaque personne n'apparaît qu'une seule fois, avec
      // un seul âge, malgré les cycles qui se chevauchent.
      expect(screen.getAllByText(/Avril Test/)).toHaveLength(1);
      expect(screen.getAllByText(/Léa Martin/)).toHaveLength(1);
      expect(screen.getAllByText(/Novembre Test/)).toHaveLength(1);
    });
  });
});
