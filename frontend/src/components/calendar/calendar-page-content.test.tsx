import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { replace as mockReplace } from "@/test-utils/navigation-mock";
import { CalendarPageContent } from "./calendar-page-content";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// require() dans la factory : voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
let mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

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

const twoTeams = [
  { id: 5, name: "U15 A" },
  { id: 8, name: "Seniors" },
];

// TRAINING (pas MATCH) : un match n'ouvre plus le dialogue d'édition
// générique depuis A5 (docs/modules/matchs.md) — ce fixture sert de simple
// événement générique pour la plupart des tests de ce fichier, "Match
// amical" n'étant que son titre.
const oneEvent = [
  {
    id: 1,
    type: "TRAINING",
    title: "Match amical",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: "2026-07-10T19:30:00.000Z",
    location: "Stade municipal",
    description: null,
    team: { id: 8, name: "Seniors" },
  },
];

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

function mockRoutes(teams: unknown, events: unknown) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/teams/mine")) return Promise.resolve(jsonResponse({ data: teams }));
    if (url.includes("/events/mine")) return Promise.resolve(jsonResponse(events));
    return Promise.resolve(jsonResponse([]));
  });
}

describe("CalendarPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockSearchParams = new URLSearchParams();
  });

  it("charge les équipes puis la vue Liste (par défaut) avec tous les types/équipes", async () => {
    mockRoutes(twoTeams, []);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/clubs/1/teams/mine", expect.anything()),
    );
    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.some(([url]) => (url as string).startsWith("/clubs/1/events/mine")),
      ).toBe(true),
    );
    const eventsCall = mockApiFetch.mock.calls.find(([url]) =>
      (url as string).startsWith("/clubs/1/events/mine"),
    )!;
    const query = queryOf(eventsCall[0] as string);
    expect(query.get("types")).toBe("TRAINING,MATCH,OTHER");
    expect(query.get("teamIds")).toBe("5,8");
  });

  it("affiche les événements reçus en vue Liste", async () => {
    mockRoutes(twoTeams, oneEvent);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    expect(await screen.findByText("Match amical")).toBeInTheDocument();
  });

  it("un rendu du parent sans rapport (filters recréé) n'invalide pas un chargement de scroll déjà en vol (bug : requête partie mais rien ne s'affichait)", async () => {
    // Mock sensible à la plage de dates demandée : la fenêtre initiale
    // (inchangée, ré-interrogée si l'effet principal redémarre à tort) ne
    // renvoie JAMAIS "Ancien match" — seule une requête loadOlder pour une
    // plage plus ancienne l'obtient. Sans ce mock précis, un simple refetch
    // fautif de la fenêtre courante pourrait masquer le bug (voir historique).
    const cutoff = new Date("2026-06-26T00:00:00.000Z");
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/teams/mine")) return Promise.resolve(jsonResponse({ data: twoTeams }));
      if (url.includes("/events/mine")) {
        const dateFrom = new Date(queryOf(url).get("dateFrom")!);
        return Promise.resolve(
          jsonResponse(
            dateFrom < cutoff
              ? [{ ...oneEvent[0], id: 2, title: "Ancien match" }]
              : oneEvent,
          ),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    const { rerender } = renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    // Démarre loadOlder (requête en vol, encore non résolue) puis force un
    // rendu du parent avec les mêmes props — avant le correctif, `filters`
    // était un objet littéral recréé à chaque rendu, ce qui redéclenchait
    // l'effet de chargement principal de CalendarListView (generationRef
    // avance) et jetait silencieusement le résultat du scroll à sa
    // résolution.
    fireEvent.wheel(container, { deltaY: -100 });
    rerender(<CalendarPageContent clubId="1" />);

    expect(await screen.findByText("Ancien match")).toBeInTheDocument();
  });

  it("décocher un type d'événement relance le chargement avec la liste réduite", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockRoutes(twoTeams, []);

    await user.click(screen.getByRole("checkbox", { name: "Match" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("types=TRAINING%2COTHER"),
        expect.anything(),
      ),
    );
  });

  it("décocher tous les types (et les anniversaires) affiche un calendrier vide sans appel réseau supplémentaire", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("checkbox", { name: "Entraînement" }));
    await user.click(screen.getByRole("checkbox", { name: "Match" }));
    // Anniversaires aussi désactivé : sinon la fenêtre pauvre en
    // anniversaires (0 ici) déclenche l'extension automatique de la vue
    // Liste (correctif post-B9) — comportement voulu, mais hors du champ de
    // ce test qui vérifie l'absence d'appel réseau côté événements.
    await user.click(screen.getByRole("checkbox", { name: "Anniversaires" }));
    mockApiFetch.mockClear();
    await user.click(screen.getByRole("checkbox", { name: "Autre" }));

    await waitFor(() =>
      expect(screen.getByText("Aucun événement à afficher")).toBeInTheDocument(),
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("le filtre par équipe n'apparaît pas quand une seule équipe est accessible", async () => {
    mockRoutes([twoTeams[0]], []);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText("Équipe")).not.toBeInTheDocument();
  });

  it("le bouton Ajouter crée un événement puis relance le chargement de la vue active", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    mockApiFetch.mockClear();
    // Route par URL même pendant la saisie du formulaire : un mockResolvedValue
    // global écraserait aussi les réponses des anniversaires/événements
    // encore en vol (voir l'effet dédié de CalendarListView), pas seulement
    // le POST de création visé ici.
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/teams/mine")) return Promise.resolve(jsonResponse({ data: twoTeams }));
      if (url.includes("/events/mine")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/members/birthdays")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ id: 99 }));
    });

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.type(screen.getByLabelText("Titre"), "Entraînement technique");
    await user.type(screen.getByLabelText("Début"), "2026-07-15T18:00");
    mockRoutes(twoTeams, oneEvent);
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/events",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // La vue Liste doit avoir été relancée après le succès de la création.
    expect(await screen.findByText("Match amical")).toBeInTheDocument();
  });

  it("bascule vers la vue Mois", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("tab", { name: "Mois" }));

    expect(screen.getByText("lun.")).toBeInTheDocument();
  });

  it("clic sur une cellule vide en vue Mois ouvre le dialogue de création à 9h par défaut", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Mois" }));

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), 15);
    const key = `calendar-day-${target.getFullYear()}-${target.getMonth()}-${target.getDate()}`;
    await user.click(await screen.findByTestId(key));

    expect(await screen.findByText("Nouvel événement")).toBeInTheDocument();
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(screen.getByLabelText<HTMLInputElement>("Début")).toHaveValue(
      `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T09:00`,
    );
  });

  it("clic sur un événement en vue Mois ouvre le dialogue d'édition", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");
    await user.click(screen.getByRole("tab", { name: "Mois" }));

    await user.click(await screen.findByText("Match amical"));

    expect(await screen.findByText("Modifier l'événement")).toBeInTheDocument();
  });

  it("clic sur un match en vue Mois n'ouvre pas le dialogue d'édition générique (A5)", async () => {
    mockRoutes(twoTeams, [{ ...oneEvent[0], type: "MATCH" }]);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");
    await user.click(screen.getByRole("tab", { name: "Mois" }));

    await user.click(await screen.findByText("Match amical"));

    expect(screen.queryByText("Modifier l'événement")).not.toBeInTheDocument();
  });

  it("bascule vers la vue Semaine", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("tab", { name: "Semaine" }));

    expect(screen.getByText(/^lun\. \d{2}$/)).toBeInTheDocument();
  });

  it("clic dans la grille horaire en vue Semaine ouvre le dialogue de création à l'heure cliquée", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Semaine" }));

    const now = new Date();
    const weekday = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday);
    const key = `calendar-week-column-${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    const column = await screen.findByTestId(key);
    fireEvent.click(column, { clientY: 96 });

    expect(await screen.findByText("Nouvel événement")).toBeInTheDocument();
    // HOUR_START=6h + 96px/48px = 8h — la valeur pré-remplie n'est pas
    // écrasée par le défaut 9h (voir atDefaultHour, event-form-dialog.tsx).
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(screen.getByLabelText<HTMLInputElement>("Début")).toHaveValue(
      `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}T08:00`,
    );
  });

  it("le filtre Anniversaires est actif par défaut, décoché il arrête l'appel réseau correspondant", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.some(([url]) => (url as string).includes("/members/birthdays")),
      ).toBe(true),
    );

    mockApiFetch.mockClear();
    await user.click(screen.getByRole("checkbox", { name: "Anniversaires" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(
      mockApiFetch.mock.calls.some(([url]) => (url as string).includes("/members/birthdays")),
    ).toBe(false);
  });

  it("le bouton Aujourd'hui recentre la vue Mois après une navigation", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Mois" }));

    const now = new Date();
    const currentMonthLabel = now.toLocaleDateString("fr", { month: "long", year: "numeric" });
    await user.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(screen.queryByText(currentMonthLabel)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    expect(screen.getByText(currentMonthLabel)).toBeInTheDocument();
  });

  describe("persistance de la vue dans l'URL (docs/roadmap.md étape B7)", () => {
    it("bascule vers la vue Mois : l'URL est mise à jour avec view=month", async () => {
      mockRoutes(twoTeams, []);
      const user = userEvent.setup();

      renderWithIntl(<CalendarPageContent clubId="1" />);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      mockReplace.mockClear();

      await user.click(screen.getByRole("tab", { name: "Mois" }));

      await waitFor(() => {
        const lastCall = mockReplace.mock.calls.at(-1) as [string, unknown] | undefined;
        expect(lastCall?.[0]).toContain("view=month");
      });
    });

    it("sans paramètre d'URL, retombe sur la vue Liste par défaut", async () => {
      mockRoutes(twoTeams, []);
      mockSearchParams = new URLSearchParams();

      renderWithIntl(<CalendarPageContent clubId="1" />);

      expect(await screen.findByTestId("calendar-list-scroll")).toBeInTheDocument();
    });

    it("avec view=week dans l'URL, affiche directement la vue Semaine au montage", async () => {
      mockRoutes(twoTeams, []);
      mockSearchParams = new URLSearchParams("view=week&week=2026-07-13");

      renderWithIntl(<CalendarPageContent clubId="1" />);

      expect(await screen.findByText(/^lun\. 13$/)).toBeInTheDocument();
      expect(screen.queryByTestId("calendar-list-scroll")).not.toBeInTheDocument();
    });

    it("avec view=month et month=... dans l'URL, affiche le bon mois au montage", async () => {
      mockRoutes(twoTeams, []);
      mockSearchParams = new URLSearchParams("view=month&month=2026-03-01");

      renderWithIntl(<CalendarPageContent clubId="1" />);

      expect(await screen.findByText("mars 2026")).toBeInTheDocument();
    });
  });

  describe("vue par défaut selon le format d'écran (retour utilisateur 2026-07-13)", () => {
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it("sans paramètre d'URL, en contexte desktop (≥768px), bascule sur la vue Mois", async () => {
      mockRoutes(twoTeams, []);
      mockSearchParams = new URLSearchParams();
      window.matchMedia = jest.fn().mockReturnValue({ matches: true });

      renderWithIntl(<CalendarPageContent clubId="1" />);

      expect(await screen.findByRole("tab", { name: "Mois", selected: true })).toBeInTheDocument();
      expect(screen.queryByTestId("calendar-list-scroll")).not.toBeInTheDocument();
    });

    it("avec view=list explicite dans l'URL, reste en vue Liste même en contexte desktop", async () => {
      mockRoutes(twoTeams, []);
      mockSearchParams = new URLSearchParams("view=list");
      window.matchMedia = jest.fn().mockReturnValue({ matches: true });

      renderWithIntl(<CalendarPageContent clubId="1" />);

      expect(await screen.findByTestId("calendar-list-scroll")).toBeInTheDocument();
    });
  });
});
