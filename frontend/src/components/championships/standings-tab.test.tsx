import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { StandingsTab } from "./standings-tab";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function renderTab() {
  return renderWithIntl(
    <StandingsTab clubId="1" teamId="5" championshipId="100" />,
  );
}

const standings = [
  {
    participantId: 1,
    rank: 1,
    played: 2,
    wins: 2,
    draws: 0,
    losses: 0,
    goalsScored: 6,
    goalsConceded: 1,
    goalDifference: 5,
    points: 6,
    participant: { internalTeam: { name: "U15" }, externalTeam: null },
  },
  {
    participantId: 2,
    rank: 2,
    played: 2,
    wins: 0,
    draws: 0,
    losses: 2,
    goalsScored: 1,
    goalsConceded: 6,
    goalDifference: -5,
    points: 0,
    participant: { internalTeam: null, externalTeam: { name: "FC Rivaux" } },
  },
];

describe("StandingsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge le classement du championnat au montage", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/standings",
        expect.anything(),
      ),
    );
  });

  it("affiche un message si le classement est vide", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    expect(
      await screen.findByText("Aucun classement disponible pour l'instant"),
    ).toBeInTheDocument();
  });

  it("liste le classement avec rang, équipe et statistiques", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(standings));

    renderTab();

    expect(await screen.findByText("U15")).toBeInTheDocument();
    expect(screen.getByText("FC Rivaux")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    // ligne d'en-tête + 2 lignes de données
    expect(rows).toHaveLength(3);
  });

  it("n'affiche aucun bouton d'édition, quel que soit le rôle — même route en lecture seule pour tous (Coach comme Player)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(standings));

    renderTab();
    await screen.findByText("U15");

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(
      await screen.findByText("Impossible de charger le classement"),
    ).toBeInTheDocument();
  });
});
