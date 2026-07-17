import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { MatchDetailPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
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

function matchDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 900,
    matchType: "AMICAL",
    homeOrAway: "HOME",
    status: "SCHEDULED",
    scoreHome: null,
    scoreAway: null,
    canManage: true,
    event: {
      id: 300,
      title: "FC Rivaux",
      startAt: "2026-08-01T18:00:00.000Z",
      location: "Stade municipal",
    },
    ...overrides,
  };
}

// L'onglet Avant-match (rendu par défaut) contient les deux colonnes
// Convocations et Composition, qui font chacune leur propre appel GET
// (.../attendances, .../lineups) en plus du GET du match — router par URL.
function mockApiFetchDefault(matchBody: unknown, matchOk = true) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    if (url.includes("/lineups")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    return Promise.resolve(jsonResponse(matchBody, matchOk));
  });
}

describe("MatchDetailPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche l'en-tête du match (adversaire, date, type, domicile/extérieur, lieu, statut)", async () => {
    mockApiFetchDefault(matchDetail());

    renderWithIntl(<MatchDetailPageContent clubId="1" teamId="5" matchId="900" />);

    expect(await screen.findByRole("heading", { name: "FC Rivaux" })).toBeInTheDocument();
    expect(screen.getByText(/Amical/)).toBeInTheDocument();
    expect(screen.getByText(/Domicile/)).toBeInTheDocument();
    expect(screen.getByText(/Stade municipal/)).toBeInTheDocument();
    expect(screen.getByText("À venir")).toBeInTheDocument();
  });

  it("affiche le score une fois le match terminé", async () => {
    mockApiFetchDefault(
      matchDetail({ status: "FINISHED", scoreHome: 3, scoreAway: 1 }),
    );

    renderWithIntl(<MatchDetailPageContent clubId="1" teamId="5" matchId="900" />);

    expect(await screen.findByText("3 – 1")).toBeInTheDocument();
    expect(screen.getByText("Terminé")).toBeInTheDocument();
  });

  it("affiche les 3 onglets, Avant-match actif par défaut (Convocations + Composition), les autres en 'bientôt disponible'", async () => {
    mockApiFetchDefault(matchDetail());
    const user = userEvent.setup();

    renderWithIntl(<MatchDetailPageContent clubId="1" teamId="5" matchId="900" />);
    await screen.findByRole("heading", { name: "FC Rivaux" });

    expect(screen.getByRole("tab", { name: "Avant-match" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Direct" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Après-match" })).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Convocations" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Composition" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Terrain" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Direct" }));
    expect(
      screen.getByText("Cette section arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });

  it("affiche l'erreur et le lien retour si le chargement échoue", async () => {
    mockApiFetchDefault(null, false);

    renderWithIntl(<MatchDetailPageContent clubId="1" teamId="5" matchId="900" />);

    expect(await screen.findByText("Impossible de charger le match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour au calendrier" })).toBeInTheDocument();
  });

  it("permet de modifier un match existant (bouton Modifier → PATCH avec le nouveau format de jeu)", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        return Promise.resolve(jsonResponse(matchDetail({ gameFormat: "NINE" })));
      }
      if (url.includes("/external-teams")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      if (url.includes("/lineups")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      return Promise.resolve(jsonResponse(matchDetail()));
    });

    renderWithIntl(<MatchDetailPageContent clubId="1" teamId="5" matchId="900" />);
    await screen.findByRole("heading", { name: "FC Rivaux" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(await screen.findByRole("heading", { name: "Modifier le match" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Format de jeu" }));
    await user.click(await screen.findByRole("option", { name: "9 vs 9" }));

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        ([, options]) => (options as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });
    const patchCall = mockApiFetch.mock.calls.find(
      ([, options]) => (options as RequestInit | undefined)?.method === "PATCH",
    )!;
    const [url, options] = patchCall;
    expect(url).toBe("/clubs/1/teams/5/matches/900");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.gameFormat).toBe("NINE");
  });
});
