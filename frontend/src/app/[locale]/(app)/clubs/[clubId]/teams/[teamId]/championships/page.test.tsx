import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ChampionshipsPageContent } from "./page";

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

// Route par URL : la page charge championnats + équipes adverses au montage,
// et le sélecteur de saison de ChampionshipFormDialog appelle /seasons.
function mockApiFetchDefault({
  championships = [] as unknown[],
  canManageChampionships = true,
  externalTeams = [] as unknown[],
  canManageExternalTeams = true,
} = {}) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/championships")) {
      return Promise.resolve(
        jsonResponse({ data: championships, canManage: canManageChampionships }),
      );
    }
    if (url.includes("/external-teams")) {
      return Promise.resolve(
        jsonResponse({ data: externalTeams, canManage: canManageExternalTeams }),
      );
    }
    if (url.includes("/seasons")) {
      return Promise.resolve(jsonResponse({ data: [{ id: 20, name: "Saison 2026-2027" }] }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

function renderPage(clubId = "1", teamId = "5") {
  return renderWithIntl(<ChampionshipsPageContent clubId={clubId} teamId={teamId} />);
}

describe("ChampionshipsPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les championnats et les équipes adverses de l'équipe courante au montage", async () => {
    mockApiFetchDefault();

    renderPage("1", "5");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships",
        expect.anything(),
      );
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.anything(),
      );
    });
  });

  it("affiche l'onglet Championnats par défaut, avec un message si la liste est vide", async () => {
    mockApiFetchDefault();

    renderPage();

    expect(await screen.findByText("Aucun championnat pour l'instant")).toBeInTheDocument();
  });

  it("liste les championnats avec la saison et les dates", async () => {
    mockApiFetchDefault({
      championships: [
        {
          id: 1,
          seasonId: 20,
          season: { id: 20, name: "Saison 2026-2027" },
          name: "Championnat Automne",
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          pointsForWin: 3,
          pointsForDraw: 1,
          pointsForLoss: 0,
          tiebreakerRules: ["GOAL_DIFFERENCE"],
          tiebreakerPreset: null,
          numberOfPeriods: 2,
          periodDurationMinutes: 45,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("Championnat Automne")).toBeInTheDocument();
    expect(screen.getByText("Saison 2026-2027")).toBeInTheDocument();
    expect(screen.getByText("01/09/2026 – 15/12/2026")).toBeInTheDocument();
  });

  it("cache le bouton Nouveau championnat et la colonne Actions quand canManage est false", async () => {
    mockApiFetchDefault({
      championships: [
        {
          id: 1,
          seasonId: 20,
          season: { id: 20, name: "Saison 2026-2027" },
          name: "Championnat Automne",
          startDate: "2026-09-01",
          endDate: "2026-12-15",
          pointsForWin: 3,
          pointsForDraw: 1,
          pointsForLoss: 0,
          tiebreakerRules: ["GOAL_DIFFERENCE"],
          tiebreakerPreset: null,
          numberOfPeriods: 2,
          periodDurationMinutes: 45,
        },
      ],
      canManageChampionships: false,
    });

    renderPage();
    await screen.findByText("Championnat Automne");

    expect(
      screen.queryByRole("button", { name: "Nouveau championnat" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("le bouton Nouveau championnat ouvre la modale de création", async () => {
    mockApiFetchDefault();
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Aucun championnat pour l'instant");

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));

    expect(
      await screen.findByRole("heading", { name: "Nouveau championnat" }),
    ).toBeInTheDocument();
  });

  it("l'onglet Équipes adverses affiche un message si la liste est vide", async () => {
    mockApiFetchDefault();
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));

    expect(await screen.findByText("Aucune équipe adverse pour l'instant")).toBeInTheDocument();
  });

  it("liste les équipes adverses avec ville et pays", async () => {
    mockApiFetchDefault({
      externalTeams: [
        { id: 10, name: "FC Rivaux", city: "Genève", country: "Suisse", notes: null },
      ],
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));

    expect(await screen.findByText("FC Rivaux")).toBeInTheDocument();
    expect(screen.getByText("Genève")).toBeInTheDocument();
    expect(screen.getByText("Suisse")).toBeInTheDocument();
  });

  it("cache le bouton Ajouter et la colonne Actions des équipes adverses quand canManage est false", async () => {
    mockApiFetchDefault({
      externalTeams: [{ id: 10, name: "FC Rivaux", city: null, country: null, notes: null }],
      canManageExternalTeams: false,
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));
    await screen.findByText("FC Rivaux");

    expect(
      screen.queryByRole("button", { name: "Ajouter une équipe adverse" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("créer une équipe adverse via la modale rafraîchit la liste", async () => {
    mockApiFetchDefault();
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 12 }));
      if (url.includes("/external-teams")) {
        return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      }
      return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.anything(),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une équipe adverse" }));
    await user.type(screen.getByLabelText("Nom"), "FC Rivaux");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
