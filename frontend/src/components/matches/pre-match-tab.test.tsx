import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { PreMatchTab } from "./pre-match-tab";

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

describe("PreMatchTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche les deux colonnes Convocations et Composition, chacune avec son propre chargement", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      if (url.includes("/lineups")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      return Promise.resolve(jsonResponse(null, false));
    });

    renderWithIntl(<PreMatchTab clubId="1" teamId="5" matchId="900" />);

    expect(screen.getByRole("heading", { name: "Convocations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Composition" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Terrain" })).toBeInTheDocument();
    expect(screen.getByText("Aucun joueur convoqué pour l'instant")).toBeInTheDocument();
  });

  it("Coach accepte une convocation : la Composition se recharge automatiquement et le joueur rejoint le banc", async () => {
    let convocationStatus = "PENDING";
    mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/attendances/1") && init?.method === "PATCH") {
        convocationStatus = "ACCEPTED";
        return Promise.resolve(jsonResponse({ id: 1 }));
      }
      if (url.includes("/attendances")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 1,
                playerId: 10,
                convocationStatus,
                player: { id: 10, member: { id: 20, firstName: "Tom", lastName: "Joueur" } },
              },
            ],
            canManage: true,
          }),
        );
      }
      if (url.includes("/lineups")) return Promise.resolve(jsonResponse({ data: [], canManage: true }));
      return Promise.resolve(jsonResponse(null, false));
    });
    const user = userEvent.setup();

    renderWithIntl(<PreMatchTab clubId="1" teamId="5" matchId="900" />);
    await screen.findByRole("group", { name: "Terrain" });

    // Avant réponse (PENDING) : Tom n'est pas encore disponible pour la composition.
    expect(screen.queryByRole("button", { name: "Tom Joueur" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Présent confirmé" }));

    // Après acceptation, la Composition (colonne indépendante) doit se
    // recharger d'elle-même et faire apparaître Tom au banc.
    expect(await screen.findByRole("button", { name: "Tom Joueur" })).toBeInTheDocument();

    await waitFor(() =>
      expect(
        mockApiFetch.mock.calls.filter(([url]) => (url as string).includes("/attendances")).length,
      ).toBeGreaterThan(2),
    );
  });
});
