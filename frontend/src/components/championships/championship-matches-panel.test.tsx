import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ChampionshipMatchesPanel } from "./championship-matches-panel";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest
    .fn()
    .mockImplementation(async (response: { json: () => Promise<{ code?: string }> }) => {
      const body = await response.json().catch(() => null);
      return body?.code ?? "AUTH.UNKNOWN";
    }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function matchesResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderPanel(teamId = "5") {
  return renderWithIntl(
    <ChampionshipMatchesPanel clubId="1" teamId={teamId} championshipId="100" />,
  );
}

const ownTeamMatch = {
  id: 1,
  homeParticipantId: 1,
  awayParticipantId: 2,
  scheduledAt: "2026-09-20T14:00:00.000Z",
  round: 3,
  status: "FINISHED",
  scoreHome: 2,
  scoreAway: 1,
  homeParticipant: { internalTeam: { id: 5, name: "U15" }, externalTeam: null },
  awayParticipant: { internalTeam: null, externalTeam: { name: "FC Rivaux" } },
};

const outsiderMatch = {
  id: 2,
  homeParticipantId: 3,
  awayParticipantId: 4,
  scheduledAt: "2026-09-10T14:00:00.000Z",
  round: 2,
  status: "SCHEDULED",
  scoreHome: null,
  scoreAway: null,
  homeParticipant: { internalTeam: null, externalTeam: { name: "AS Voisins" } },
  awayParticipant: { internalTeam: null, externalTeam: { name: "US Rivale" } },
};

describe("ChampionshipMatchesPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les rencontres du championnat au montage", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([]));

    renderPanel();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches",
        expect.anything(),
      ),
    );
  });

  it("affiche un message si aucune rencontre", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([]));

    renderPanel();

    expect(await screen.findByText("Aucune rencontre planifiée pour l'instant")).toBeInTheDocument();
  });

  it("trie les rencontres par date croissante, indépendamment de la journée", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([ownTeamMatch, outsiderMatch]));

    renderPanel();
    await screen.findByText("U15");

    const items = screen.getAllByText(/^(U15|AS Voisins)$/);
    expect(items[0]).toHaveTextContent("AS Voisins");
    expect(items[1]).toHaveTextContent("U15");
  });

  it("affiche journée, équipes et scores des deux côtés", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([ownTeamMatch]));

    renderPanel();

    expect(await screen.findByText("U15")).toBeInTheDocument();
    expect(screen.getByText("FC Rivaux")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/J3/)).toBeInTheDocument();
  });

  it("met en valeur les rencontres impliquant l'équipe propriétaire du championnat", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([ownTeamMatch, outsiderMatch]));

    renderPanel("5");
    await screen.findByText("U15");

    const ownRow = screen.getByText("U15").closest("li");
    const outsiderRow = screen.getByText("AS Voisins").closest("li");
    expect(ownRow?.className).toContain("border-primary");
    expect(outsiderRow?.className).not.toContain("border-primary");
  });

  it("cache le bouton Planifier et les actions par rencontre quand canManage est false", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([ownTeamMatch], false));

    renderPanel();
    await screen.findByText("U15");

    expect(screen.queryByRole("button", { name: "Planifier une rencontre" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajout en masse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPanel();

    expect(await screen.findByText("Impossible de charger les rencontres")).toBeInTheDocument();
  });
});
