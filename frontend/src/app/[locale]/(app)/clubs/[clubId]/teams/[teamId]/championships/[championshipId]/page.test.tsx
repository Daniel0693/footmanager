import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { push } from "@/test-utils/navigation-mock";
import { ChampionshipDetailPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const championship = {
  id: 100,
  seasonId: 20,
  season: { id: 20, name: "Saison 2026-2027" },
  name: "Championnat Automne",
  startDate: "2026-09-01T00:00:00.000Z",
  endDate: "2026-12-15T00:00:00.000Z",
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakerRules: ["GOAL_DIFFERENCE"],
  tiebreakerPreset: null,
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  canManage: true,
};

// Router par URL : la fiche charge le championnat, puis l'onglet
// Participants (par défaut) charge ses propres données ; l'onglet Calendrier
// (matches) charge les siennes dès qu'il est activé.
function mockApiFetchDefault(champ: unknown = championship, ok = true) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/participants")) {
      return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    }
    if (url.includes("/matches")) {
      return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    }
    return Promise.resolve(jsonResponse(champ, ok));
  });
}

function renderPage(championshipId = "100") {
  return renderWithIntl(
    <ChampionshipDetailPageContent clubId="1" teamId="5" championshipId={championshipId} />,
  );
}

describe("ChampionshipDetailPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge et affiche le championnat (nom, saison, dates)", async () => {
    mockApiFetchDefault();

    renderPage();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100",
        expect.anything(),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "Championnat Automne" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saison 2026-2027/)).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetchDefault(null, false);

    renderPage();

    expect(await screen.findByText("Impossible de charger le championnat")).toBeInTheDocument();
  });

  it("affiche l'onglet Participants par défaut", async () => {
    mockApiFetchDefault();

    renderPage();
    await screen.findByRole("heading", { name: "Championnat Automne" });

    expect(await screen.findByText("Aucun participant pour l'instant")).toBeInTheDocument();
  });

  it("l'onglet Calendrier charge les rencontres, l'onglet Classement affiche un message d'attente", async () => {
    mockApiFetchDefault();
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Championnat Automne" });

    await user.click(screen.getByRole("tab", { name: "Calendrier" }));
    expect(
      await screen.findByText("Aucune rencontre planifiée pour l'instant"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Classement" }));
    expect(
      await screen.findByText("Le classement arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });

  it("cache Modifier/Supprimer quand canManage est false", async () => {
    mockApiFetchDefault({ ...championship, canManage: false });

    renderPage();

    await screen.findByRole("heading", { name: "Championnat Automne" });
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  });

  it("Modifier ouvre la modale d'édition pré-remplie", async () => {
    mockApiFetchDefault();
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Championnat Automne" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(
      await screen.findByRole("heading", { name: "Modifier le championnat" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Championnat Automne");
  });

  it("supprime le championnat après confirmation et redirige vers la liste", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/participants")) {
        return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      }
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse(championship));
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole("heading", { name: "Championnat Automne" });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(push).toHaveBeenCalledWith("/clubs/1/teams/5/championships");
  });
});
