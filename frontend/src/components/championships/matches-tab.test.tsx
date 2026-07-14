import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { MatchesTab } from "./matches-tab";

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

function matchesResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderTab() {
  return renderWithIntl(
    <MatchesTab clubId="1" teamId="5" championshipId="100" />,
  );
}

describe("MatchesTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les rencontres du championnat au montage", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([]));

    renderTab();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches",
        expect.anything(),
      ),
    );
  });

  it("affiche un message si aucune rencontre planifiée", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([]));

    renderTab();

    expect(
      await screen.findByText("Aucune rencontre planifiée pour l'instant"),
    ).toBeInTheDocument();
  });

  it("liste les rencontres avec les équipes, le score et le statut", async () => {
    mockApiFetch.mockResolvedValue(
      matchesResponse([
        {
          id: 1,
          homeParticipantId: 1,
          awayParticipantId: 2,
          scheduledAt: "2026-09-15T15:00:00.000Z",
          round: 1,
          status: "FINISHED",
          scoreHome: 3,
          scoreAway: 1,
          homeParticipant: { internalTeam: { name: "U15" }, externalTeam: null },
          awayParticipant: { internalTeam: null, externalTeam: { name: "FC Rivaux" } },
        },
      ]),
    );

    renderTab();

    expect(await screen.findByText("U15 – FC Rivaux")).toBeInTheDocument();
    expect(screen.getByText("3 – 1")).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
  });

  it("cache le bouton Planifier et la colonne Actions quand canManage est false", async () => {
    mockApiFetch.mockResolvedValue(
      matchesResponse(
        [
          {
            id: 1,
            homeParticipantId: 1,
            awayParticipantId: 2,
            scheduledAt: "2026-09-15T15:00:00.000Z",
            round: 1,
            status: "SCHEDULED",
            scoreHome: null,
            scoreAway: null,
            homeParticipant: { internalTeam: { name: "U15" }, externalTeam: null },
            awayParticipant: { internalTeam: null, externalTeam: { name: "FC Rivaux" } },
          },
        ],
        false,
      ),
    );

    renderTab();
    await screen.findByText("U15 – FC Rivaux");

    expect(
      screen.queryByRole("button", { name: "Planifier une rencontre" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("le bouton Planifier ouvre la modale de création", async () => {
    mockApiFetch.mockResolvedValue(matchesResponse([]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Aucune rencontre planifiée pour l'instant");

    await user.click(screen.getByRole("button", { name: "Planifier une rencontre" }));

    expect(
      await screen.findByRole("heading", { name: "Planifier une rencontre" }),
    ).toBeInTheDocument();
  });
});
