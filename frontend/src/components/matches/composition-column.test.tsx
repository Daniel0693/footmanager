import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { CompositionColumn } from "./composition-column";

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

function attendance(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 10,
    convocationStatus: "ACCEPTED",
    player: { member: { firstName: "Tom", lastName: "Joueur" } },
    ...overrides,
  };
}

function lineupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    playerId: 11,
    lineupStatus: "TITULAIRE",
    position: "ST",
    pitchSpotId: "st",
    shirtNumber: 9,
    player: { id: 11, member: { id: 21, firstName: "Léa", lastName: "Autre" } },
    ...overrides,
  };
}

function renderColumn(refreshKey = 0) {
  return renderWithIntl(
    <CompositionColumn clubId="1" teamId="5" matchId="900" refreshKey={refreshKey} />,
  );
}

describe("CompositionColumn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche une erreur si le chargement de la composition échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderColumn();

    expect(await screen.findByText("Impossible de charger la composition")).toBeInTheDocument();
  });

  it("canManage=true : le banc se peuple des joueurs ayant accepté leur convocation, non encore placés", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              attendance(),
              attendance({
                playerId: 11,
                player: { member: { firstName: "Léa", lastName: "Autre" } },
              }),
              attendance({ playerId: 12, convocationStatus: "PENDING" }),
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ data: [lineupRow()], canManage: true }));
    });

    renderColumn();

    // Léa (playerId 11) est déjà placée (lineupRow) : elle apparaît en
    // titulaire, pas au banc. Tom (accepté, non placé) est au banc. Le
    // joueur PENDING n'apparaît nulle part.
    expect(await screen.findByRole("button", { name: "Tom Joueur" })).toBeInTheDocument();
    expect(screen.getByText("Titulaires")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buteur — Léa Autre" })).toBeInTheDocument();
    expect(screen.queryByText("Non Répondu")).not.toBeInTheDocument();
  });

  it("canManage=true : placer un joueur du banc sur un poste envoie un POST bulk TITULAIRE", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) {
        return Promise.resolve(jsonResponse({ data: [attendance()] }));
      }
      if (url.endsWith("/bulk")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    });
    const user = userEvent.setup();

    renderColumn();
    await screen.findByRole("button", { name: "Tom Joueur" });

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getByRole("button", { name: "Buteur" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      entries: [{ playerId: 10, lineupStatus: "TITULAIRE", position: "ST", pitchSpotId: "st" }],
    });
  });

  it("canManage=true : retirer un titulaire du terrain envoie un DELETE", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.endsWith("/lineups"))
        return Promise.resolve(jsonResponse({ data: [lineupRow()], canManage: true }));
      return Promise.resolve(jsonResponse({}, true));
    });
    const user = userEvent.setup();

    renderColumn();
    await screen.findByText("Titulaires");

    await user.click(screen.getByRole("button", { name: "Retirer du terrain" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("canManage=true : modifier le numéro de maillot d'un titulaire envoie un POST bulk au blur", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.endsWith("/bulk")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ data: [lineupRow()], canManage: true }));
    });
    const user = userEvent.setup();

    renderColumn();
    await screen.findByText("Titulaires");

    const input = screen.getByLabelText("Numéro de maillot");
    await user.clear(input);
    await user.type(input, "7");
    await user.tab();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ entries: [{ playerId: 11, lineupStatus: "TITULAIRE", shirtNumber: 7 }] });
  });

  it("canManage=false (Player) : lecture seule, pas de fetch des convocations, badges poste/numéro", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) {
        throw new Error("Player ne devrait jamais déclencher ce fetch (bench inutile en lecture seule)");
      }
      return Promise.resolve(jsonResponse({ data: [lineupRow()], canManage: false }));
    });

    renderColumn();

    expect(await screen.findByText("Titulaires")).toBeInTheDocument();
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.queryByLabelText("Numéro de maillot")).not.toBeInTheDocument();
  });

  it("se recharge quand refreshKey change (synchronisation avec les convocations)", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) return Promise.resolve(jsonResponse({ data: [] }));
      return Promise.resolve(jsonResponse({ data: [], canManage: true }));
    });

    const { rerender } = renderColumn(0);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    mockApiFetch.mockClear();

    rerender(
      <CompositionColumn clubId="1" teamId="5" matchId="900" refreshKey={1} />,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  });
});
