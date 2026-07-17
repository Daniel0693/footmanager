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
    pitchSpotId: "fwd-1",
    shirtNumber: 9,
    isCaptain: false,
    player: { id: 11, member: { id: 21, firstName: "Léa", lastName: "Autre" } },
    ...overrides,
  };
}

// Route par URL : `/attendances`, `/lineups/bulk`, `/lineups` (GET) et
// `/lineups/:id` (DELETE) avant le repli sur la fiche match elle-même
// (`GET`/`PATCH .../matches/900`, désormais interrogée par CompositionColumn
// pour le système tactique, docs/modules/matchs.md §Composition B8).
function mockRoutes({
  attendances,
  lineups,
  canManage = true,
  formation = null,
}: {
  attendances?: unknown[];
  lineups?: unknown[];
  canManage?: boolean;
  formation?: string | null;
}) {
  mockApiFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes("/attendances")) {
      return Promise.resolve(jsonResponse({ data: attendances ?? [] }));
    }
    if (url.endsWith("/bulk")) return Promise.resolve(jsonResponse([]));
    if (url.endsWith("/lineups")) {
      return Promise.resolve(jsonResponse({ data: lineups ?? [], canManage }));
    }
    if (url.match(/\/lineups\/\d+$/) && init?.method === "DELETE") {
      return Promise.resolve(jsonResponse({}));
    }
    return Promise.resolve(jsonResponse({ id: 900, formation }));
  });
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
    mockRoutes({
      attendances: [
        attendance(),
        attendance({ playerId: 11, player: { member: { firstName: "Léa", lastName: "Autre" } } }),
        attendance({ playerId: 12, convocationStatus: "PENDING" }),
      ],
      lineups: [lineupRow()],
    });

    renderColumn();

    // Léa (playerId 11) est déjà placée (lineupRow) : elle apparaît sur le
    // terrain, pas au banc. Tom (accepté, non placé) est au banc. Le joueur
    // PENDING n'apparaît nulle part.
    expect(await screen.findByRole("button", { name: "Tom Joueur" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ATT — Léa Autre" })).toBeInTheDocument();
    expect(screen.queryByText("Non Répondu")).not.toBeInTheDocument();
  });

  it("canManage=true : placer un joueur du banc sur un poste envoie un POST bulk TITULAIRE", async () => {
    mockRoutes({ attendances: [attendance()], lineups: [] });
    const user = userEvent.setup();

    renderColumn();
    await screen.findByRole("button", { name: "Tom Joueur" });

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getAllByRole("button", { name: "ATT" })[0]);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      entries: [{ playerId: 10, lineupStatus: "TITULAIRE", position: "ST", pitchSpotId: "fwd-1" }],
    });
  });

  it("canManage=true : sélectionner un titulaire puis Retirer du terrain envoie un DELETE", async () => {
    mockRoutes({ attendances: [], lineups: [lineupRow()] });
    const user = userEvent.setup();

    renderColumn();
    await user.click(await screen.findByRole("button", { name: "ATT — Léa Autre" }));

    await user.click(await screen.findByRole("button", { name: "Retirer du terrain" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("canManage=true : sélectionner un titulaire puis modifier son numéro de maillot envoie un POST bulk au blur", async () => {
    mockRoutes({ attendances: [], lineups: [lineupRow()] });
    const user = userEvent.setup();

    renderColumn();
    await user.click(await screen.findByRole("button", { name: "ATT — Léa Autre" }));

    const input = await screen.findByLabelText("Numéro de maillot");
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

  it("canManage=true : sélectionner un titulaire puis le nommer capitaine envoie un POST bulk isCaptain", async () => {
    mockRoutes({ attendances: [], lineups: [lineupRow()] });
    const user = userEvent.setup();

    renderColumn();
    await user.click(await screen.findByRole("button", { name: "ATT — Léa Autre" }));

    await user.click(await screen.findByRole("button", { name: "Nommer capitaine" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      entries: [{ playerId: 11, lineupStatus: "TITULAIRE", isCaptain: true }],
    });
  });

  it("canManage=true : sélectionner un joueur du banc puis le marquer non retenu envoie un POST bulk NON_CONVOQUE", async () => {
    mockRoutes({ attendances: [attendance()], lineups: [] });
    const user = userEvent.setup();

    renderColumn();
    await user.click(await screen.findByRole("button", { name: "Tom Joueur" }));
    await user.click(await screen.findByRole("button", { name: "Marquer non retenu" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ entries: [{ playerId: 10, lineupStatus: "NON_CONVOQUE" }] });
  });

  it("canManage=true : change de système et retire les titulaires dont le poste n'existe plus", async () => {
    mockRoutes({
      attendances: [],
      lineups: [lineupRow({ pitchSpotId: "def-5" })], // n'existe pas en 4-3-3
      formation: "4-4-2",
    });
    const user = userEvent.setup();

    renderColumn();
    await screen.findByRole("combobox", { name: "Système" });

    await user.click(screen.getByRole("combobox", { name: "Système" }));
    await user.click(await screen.findByRole("option", { name: "4-3-3" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ formation: "4-3-3" }) }),
      ),
    );
  });

  it("canManage=false (Player) : lecture seule, pas de fetch des convocations, pas de sélecteur de système", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) {
        throw new Error("Player ne devrait jamais déclencher ce fetch (bench inutile en lecture seule)");
      }
      if (url.endsWith("/lineups")) {
        return Promise.resolve(jsonResponse({ data: [lineupRow()], canManage: false }));
      }
      return Promise.resolve(jsonResponse({ id: 900, formation: null }));
    });

    renderColumn();

    expect(await screen.findByRole("button", { name: "ATT — Léa Autre" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.queryByLabelText("Numéro de maillot")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Système" })).not.toBeInTheDocument();
  });

  it("se recharge quand refreshKey change (synchronisation avec les convocations)", async () => {
    mockRoutes({ attendances: [], lineups: [] });

    const { rerender } = renderColumn(0);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    mockApiFetch.mockClear();

    rerender(<CompositionColumn clubId="1" teamId="5" matchId="900" refreshKey={1} />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  });
});
