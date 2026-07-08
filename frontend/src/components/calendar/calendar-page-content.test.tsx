import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { CalendarPageContent } from "./calendar-page-content";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const twoTeams = [
  { id: 5, name: "U15 A" },
  { id: 8, name: "Seniors" },
];

const oneEvent = [
  {
    id: 1,
    type: "MATCH",
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
    if (url.includes("/teams/mine")) return Promise.resolve(jsonResponse(teams));
    if (url.includes("/events/mine")) return Promise.resolve(jsonResponse(events));
    return Promise.resolve(jsonResponse([]));
  });
}

describe("CalendarPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les équipes puis le calendrier avec tous les types/équipes sélectionnés, trié ascendant", async () => {
    mockRoutes(twoTeams, []);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/clubs/1/teams/mine", expect.anything()),
    );
    await waitFor(() =>
      expect(mockApiFetch.mock.calls.some(([url]) => (url as string).startsWith("/clubs/1/events/mine"))).toBe(true),
    );
    const eventsCall = mockApiFetch.mock.calls.find(([url]) =>
      (url as string).startsWith("/clubs/1/events/mine"),
    )!;
    const query = queryOf(eventsCall[0] as string);
    expect(query.get("types")).toBe("TRAINING,MATCH,OTHER");
    expect(query.get("teamIds")).toBe("5,8");
    expect(query.get("sortOrder")).toBe("asc");
  });

  it("affiche les événements reçus avec leurs badges type/équipe et le lieu", async () => {
    mockRoutes(twoTeams, oneEvent);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    expect(await screen.findByText("Match amical")).toBeInTheDocument();
    const list = within(screen.getByRole("list"));
    expect(list.getByText("Match")).toBeInTheDocument();
    expect(list.getByText("Seniors")).toBeInTheDocument();
    expect(list.getByText("Stade municipal")).toBeInTheDocument();
  });

  it("affiche un état vide quand aucun événement n'est renvoyé", async () => {
    mockRoutes(twoTeams, []);

    renderWithIntl(<CalendarPageContent clubId="1" />);

    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
  });

  it("décocher un type d'événement relance le calendrier avec la liste réduite", async () => {
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

  it("décocher tous les types affiche un calendrier vide sans appel réseau supplémentaire", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("checkbox", { name: "Entraînement" }));
    await user.click(screen.getByRole("checkbox", { name: "Match" }));
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

  it("supprime un événement puis recharge le calendrier", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse(null));
      if (url.includes("/teams/mine")) return Promise.resolve(jsonResponse(twoTeams));
      if (url.includes("/events/mine")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/8/events/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Aucun événement à afficher")).toBeInTheDocument(),
    );
  });

  it("bascule vers la vue Mois et affiche les événements du mois courant", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("tab", { name: "Mois" }));

    expect(screen.getByText("lun.")).toBeInTheDocument();
    const now = new Date();
    const monthLabel = now.toLocaleDateString("fr", { month: "long", year: "numeric" });
    expect(screen.getByText(monthLabel)).toBeInTheDocument();
  });

  it("clic sur une cellule vide en vue Mois ouvre le dialogue de création pré-rempli", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Mois" }));

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), 15);
    const key = `calendar-day-${target.getFullYear()}-${target.getMonth()}-${target.getDate()}`;
    await user.click(screen.getByTestId(key));

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

    await user.click(screen.getByText("Match amical"));

    expect(await screen.findByText("Modifier l'événement")).toBeInTheDocument();
  });

  it("bascule vers la vue Semaine et affiche les événements de la semaine courante", async () => {
    mockRoutes(twoTeams, oneEvent);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await screen.findByText("Match amical");

    await user.click(screen.getByRole("tab", { name: "Semaine" }));

    // La grille Semaine affiche les jours au format "lun. 06" (jour inclus) —
    // distinct du "lun." seul de la vue Mois, donc pas de collision de texte.
    expect(screen.getByText(/^lun\. \d{2}$/)).toBeInTheDocument();
  });

  it("clic sur une cellule vide en vue Semaine ouvre le dialogue de création pré-rempli", async () => {
    mockRoutes(twoTeams, []);
    const user = userEvent.setup();

    renderWithIntl(<CalendarPageContent clubId="1" />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Semaine" }));

    // Le lundi de la semaine courante est nécessairement affiché comme
    // premier jour de la grille hebdomadaire.
    const now = new Date();
    const weekday = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekday);
    const key = `calendar-day-${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;
    await user.click(screen.getByTestId(key));

    expect(await screen.findByText("Nouvel événement")).toBeInTheDocument();
  });
});
