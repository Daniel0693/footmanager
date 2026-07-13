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
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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
        recenterKey={0} colorMode="type"
      />,
    );

    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche les événements reçus", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );

    expect(await screen.findByText("Match amical")).toBeInTheDocument();
  });

  it('colorMode="type" : le badge de type reprend la couleur des filtres, le badge d\'équipe reste neutre', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );

    const typeBadge = await screen.findByText("Match");
    // MATCH = 2e slot de la palette catégorielle (voir lib/calendar-color.ts).
    expect(typeBadge.className).toContain("bg-palette-2");
    expect(screen.getByText("U15 A").className).not.toMatch(/bg-palette/);
  });

  it('colorMode="team" : le badge d\'équipe reprend la couleur, le badge de type reste neutre', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="team" />,
    );

    const teamBadge = await screen.findByText("U15 A");
    // Seule équipe de la liste `teams` → 1er slot de la palette.
    expect(teamBadge.className).toContain("bg-palette-1");
    expect(screen.getByText("Match").className).not.toMatch(/bg-palette/);
  });

  describe("repères aujourd'hui/en cours (retour utilisateur 2026-07-13)", () => {
    // Horloge système gelée sur 2026-07-10T12:00:00.000Z (beforeEach).
    it("insère un séparateur 'Aujourd'hui' entre le dernier événement passé et le premier futur", async () => {
      mockApiFetch.mockResolvedValueOnce(
        jsonResponse([
          eventItem({ id: 1, title: "Passé", startAt: "2026-07-09T08:00:00.000Z" }),
          eventItem({ id: 2, title: "Futur", startAt: "2026-07-11T08:00:00.000Z" }),
        ]),
      );
      renderWithIntl(
        <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
      );

      await screen.findByText("Passé");
      const list = screen.getByRole("list");
      const divider = screen.getByTestId("calendar-list-now-divider");
      const items = Array.from(list.children);
      expect(items.indexOf(divider)).toBeGreaterThan(
        items.findIndex((el) => el.textContent?.includes("Passé")),
      );
      expect(items.indexOf(divider)).toBeLessThan(
        items.findIndex((el) => el.textContent?.includes("Futur")),
      );
    });

    it("un événement dont l'heure système tombe dans sa plage affiche le badge 'En cours'", async () => {
      mockApiFetch.mockResolvedValueOnce(
        jsonResponse([
          eventItem({
            title: "Match en direct",
            startAt: "2026-07-10T11:00:00.000Z",
            endAt: "2026-07-10T13:00:00.000Z",
          }),
        ]),
      );
      renderWithIntl(
        <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
      );

      await screen.findByText("Match en direct");
      expect(screen.getByText("En cours")).toBeInTheDocument();
      expect(screen.queryByText("Aujourd'hui")).not.toBeInTheDocument();
    });

    it("un événement du jour pas encore commencé affiche le badge 'Aujourd'hui' sans 'En cours'", async () => {
      mockApiFetch.mockResolvedValueOnce(
        jsonResponse([
          eventItem({ title: "Match ce soir", startAt: "2026-07-10T20:00:00.000Z" }),
        ]),
      );
      renderWithIntl(
        <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
      );

      await screen.findByText("Match ce soir");
      expect(screen.getByText("Aujourd'hui")).toBeInTheDocument();
      expect(screen.queryByText("En cours")).not.toBeInTheDocument();
    });
  });

  it("affiche la plage de dates actuellement chargée", async () => {
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );

    const range = await screen.findByTestId("calendar-list-visible-range");
    // Fenêtre initiale : 2026-06-26 (aujourd'hui - 14j) au 2026-09-08
    // (aujourd'hui + 60j) — vérifie les deux bornes plutôt que le format
    // exact (dépendant de la locale ICU du runtime).
    expect(range.textContent).toContain("26");
    expect(range.textContent).toContain("2026");
  });

  it("la plage affichée s'étend vers le passé après un scroll vers le haut", async () => {
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    const range = await screen.findByTestId("calendar-list-visible-range");
    const initialText = range.textContent;

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 50;
    fireEvent.scroll(container);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("calendar-list-visible-range").textContent).not.toBe(initialText),
    );
    // Nouvelle borne passée : 2026-05-27 (ancienne borne - 30j).
    expect(screen.getByTestId("calendar-list-visible-range").textContent).toContain("27");
  });

  it("scroll près du haut charge les événements plus anciens et les ajoute au début", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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

  it("un geste de scroll vers le haut alors qu'on est déjà en haut de la liste charge quand même les événements plus anciens (bug : aucun événement `scroll` ne se déclenche depuis scrollTop=0)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 2, title: "Ancien match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    // scrollTop reste à 0 (valeur initiale, jamais modifiée) : un simple
    // `fireEvent.scroll` ne reproduirait pas le bug, seul un vrai geste
    // `wheel` vers le haut (deltaY négatif) le déclenche.
    fireEvent.wheel(container, { deltaY: -100 });

    expect(await screen.findByText("Ancien match")).toBeInTheDocument();
  });

  it("une rafale de wheel très rapprochés (un seul geste physique en émet des dizaines) ne déclenche qu'un seul appel réseau, pas un par événement (bug : événements qui apparaissaient puis disparaissaient)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 2, title: "Ancien match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });

    // Sans verrou synchrone (une ref, pas un state), chacun de ces 10
    // événements — dispatchés avant qu'aucun rendu n'ait eu lieu entre eux —
    // passerait le garde-fou et déclencherait son propre appel réseau
    // concurrent, chacun mutant les bornes/événements indépendamment.
    for (let i = 0; i < 10; i++) {
      fireEvent.wheel(container, { deltaY: -100 });
    }

    expect(await screen.findByText("Ancien match")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("un geste de scroll vers le bas (wheel) déclenche loadNewer près du bas, mais pas ailleurs dans la liste", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 300; // loin du bas (1000 - 300 - 400 = 300 >= seuil)
    fireEvent.wheel(container, { deltaY: 100 });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("timeline trop courte pour déborder du conteneur : le wheel charge quand même dans les deux sens (bug signalé — plus aucun moyen d'avancer/reculer sinon)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();

    const container = screen.getByTestId("calendar-list-scroll");
    // Contenu plus court que le conteneur : rien à scroller, scrollTop reste
    // bloqué à 0 quel que soit le sens du geste.
    Object.defineProperty(container, "scrollHeight", { value: 300, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });

    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 2, title: "Événement futur" })]));
    fireEvent.wheel(container, { deltaY: 100 });
    expect(await screen.findByText("Événement futur")).toBeInTheDocument();

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 3, title: "Événement passé" })]));
    fireEvent.wheel(container, { deltaY: -100 });
    expect(await screen.findByText("Événement passé")).toBeInTheDocument();
  });

  it("scroll près du bas charge les événements futurs et les ajoute à la fin", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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

  it("fenêtre glissante bornée : un scroll prolongé vers le passé purge le futur au-delà de MAX_WINDOW_DAYS (pas d'accumulation infinie)", async () => {
    // Événement à aujourd'hui + 58j : dans la fenêtre initiale (+60j).
    // MAX_WINDOW_DAYS = 400j (plafond volontairement généreux, voir le
    // commentaire dans calendar-list-view.tsx — un plafond trop serré
    // purgeait le futur après seulement quelques secondes de scroll vers le
    // passé). Avec une extension de CHUNK_DAYS=30j par scroll, span =
    // 74 + 30*i tant que le futur n'a jamais été replié : dépasse 400 au
    // 11e scroll (74 + 330 = 404), qui referme alors le futur à
    // -344 + 400 = +56j — sous les +58j de l'événement, qui disparaît.
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse([eventItem({ id: 1, title: "Événement lointain", startAt: "2026-09-06T10:00:00.000Z" })]),
    );
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
    );
    await screen.findByText("Événement lointain");
    // La suite du test n'a plus besoin d'une horloge figée (aucun nouvel
    // appel à `new Date()` après le montage — les extensions suivantes se
    // basent sur pastBoundary/futureBoundary déjà en state) : on repasse en
    // horloge réelle pour que le planificateur de React puisse effectivement
    // committer chaque mise à jour d'état entre deux scrolls successifs —
    // sous horloge simulée, les scrolls suivants recalculaient tous la même
    // fenêtre (React ne re-rendait jamais entre deux appels imperatifs).
    jest.useRealTimers();

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });

    // 10 scrolls vers le passé : span reste sous 400j (74 + 300 = 374), pas
    // de purge — l'événement lointain reste visible. On attend, à chaque
    // itération, que la borne passée affichée reflète bien ce scroll précis
    // (pas seulement que l'appel réseau ait été émis) : entre deux scrolls
    // imperatifs, React ne recommite pas forcément l'état avant que le verrou
    // isLoadingMoreRef ne se libère — se fier au seul nombre d'appels laisse
    // le rendu "en retard" d'un cran, ce qui décale artificiellement toute la
    // séquence.
    const expectedPastLabels = [
      "27 mai", "27 avr.", "28 mars", "26 févr.", "27 janv.",
      "28 déc.", "28 nov.", "29 oct.", "29 sept.", "30 août",
    ];
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    for (const expectedLabel of expectedPastLabels) {
      container.scrollTop = 50;
      fireEvent.scroll(container);
      await waitFor(() =>
        expect(screen.getByTestId("calendar-list-visible-range").textContent).toContain(
          expectedLabel,
        ),
      );
    }
    expect(mockApiFetch).toHaveBeenCalledTimes(10);
    expect(screen.getByText("Événement lointain")).toBeInTheDocument();

    // 11e scroll : span dépasse 400j, le futur se referme à +56j (04 sept.
    // 2026) — l'événement à +58j (06 sept. 2026) sort de la fenêtre et
    // disparaît.
    container.scrollTop = 50;
    fireEvent.scroll(container);
    await waitFor(() =>
      expect(screen.getByTestId("calendar-list-visible-range").textContent).toContain(
        "04 sept. 2026",
      ),
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(11);

    expect(screen.queryByText("Événement lointain")).not.toBeInTheDocument();
  });

  it("supprime un événement de la liste sans recharger toute la fenêtre", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} colorMode="type" />,
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
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={1} colorMode="type" />,
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
          recenterKey={0} colorMode="type"
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
          recenterKey={0} colorMode="type"
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
          recenterKey={0} colorMode="type"
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
          recenterKey={0} colorMode="type"
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
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={0} colorMode="type" />,
      );

      // Deux "clics" rapprochés (recenterKey incrémenté) sans attendre que
      // le cycle précédent (et son extension automatique) ait fini de
      // converger — exactement le scénario qui provoquait le doublon.
      rerender(
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={1} colorMode="type" />,
      );
      rerender(
        <CalendarListView clubId="1" teams={teams} filters={filters} refreshKey={0} recenterKey={2} colorMode="type" />,
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
