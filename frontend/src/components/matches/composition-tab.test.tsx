import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { CompositionTab } from "./composition-tab";

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

function lineup(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    playerId: 10,
    lineupStatus: "TITULAIRE",
    position: null,
    shirtNumber: null,
    player: { id: 10, member: { id: 20, firstName: "Tom", lastName: "Joueur" } },
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", matchId = "900") {
  return renderWithIntl(<CompositionTab clubId={clubId} teamId={teamId} matchId={matchId} />);
}

describe("CompositionTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche un état vide quand la composition est vide", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [], canManage: false }));

    renderTab();

    expect(
      await screen.findByText("Aucun joueur dans la composition pour l'instant"),
    ).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(await screen.findByText("Impossible de charger la composition")).toBeInTheDocument();
  });

  it("canManage=false (Player) : lecture seule, badges poste/numéro, pas de contrôles", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse(
        { data: [lineup({ position: "ST", shirtNumber: 9 })], canManage: false },
      ),
    );

    renderTab();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByText("Buteur")).toBeInTheDocument();
    expect(screen.getByText("#9")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter des joueurs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Poste" })).not.toBeInTheDocument();
  });

  it("canManage=true (Coach) : sélecteur de poste, numéro, statut modifiable, retrait disponible", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [lineup()], canManage: true }),
    );

    renderTab();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter des joueurs" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Poste" })).toBeInTheDocument();
    expect(screen.getByLabelText("Numéro de maillot")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Statut dans la composition" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remplaçant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer" })).toBeInTheDocument();
  });

  it("Coach change le statut d'un joueur en un clic : POST bulk lineupStatus", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ data: [lineup()], canManage: true }));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [lineup({ lineupStatus: "REMPLACANT" })], canManage: true }),
    );

    await user.click(screen.getByRole("button", { name: "Remplaçant" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ entries: [{ playerId: 10, lineupStatus: "REMPLACANT" }] });
  });

  it("Coach choisit un poste : POST bulk avec lineupStatus courant + position", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ data: [lineup()], canManage: true }));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [lineup({ position: "ST" })], canManage: true }),
    );

    await user.click(screen.getByRole("combobox", { name: "Poste" }));
    await user.click(await screen.findByRole("option", { name: "Buteur" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      entries: [{ playerId: 10, lineupStatus: "TITULAIRE", position: "ST" }],
    });
  });

  it("Coach saisit un numéro de maillot : POST bulk au blur", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ data: [lineup()], canManage: true }));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [lineup({ shirtNumber: 9 })], canManage: true }),
    );

    const input = screen.getByLabelText("Numéro de maillot");
    await user.type(input, "9");
    await user.tab();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      entries: [{ playerId: 10, lineupStatus: "TITULAIRE", shirtNumber: 9 }],
    });
  });

  it("Coach retire un joueur de la composition : confirme puis envoie un DELETE", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ data: [lineup()], canManage: true }));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [], canManage: true }));

    await user.click(screen.getByRole("button", { name: "Retirer" }));
    await user.click(screen.getByRole("button", { name: "Retirer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("Coach ajoute un joueur : charge les convocations acceptées, exclut ceux déjà en composition, POST bulk", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/attendances")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                playerId: 10,
                convocationStatus: "ACCEPTED",
                player: { member: { firstName: "Tom", lastName: "Joueur" } },
              },
              {
                playerId: 11,
                convocationStatus: "ACCEPTED",
                player: { member: { firstName: "Léa", lastName: "Autre" } },
              },
              {
                playerId: 12,
                convocationStatus: "PENDING",
                player: { member: { firstName: "Non", lastName: "Répondu" } },
              },
            ],
          }),
        );
      }
      if (url.endsWith("/bulk")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ data: [lineup()], canManage: true }));
    });
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");

    await user.click(screen.getByRole("button", { name: "Ajouter des joueurs" }));

    // Tom (déjà en composition) n'apparaît pas ; Léa (acceptée) oui ; Non Répondu (PENDING) exclu.
    expect(await screen.findByText("Léa Autre")).toBeInTheDocument();
    expect(screen.queryByText("Non Répondu")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/lineups/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(
      ([url, init]) =>
        (url as string).endsWith("/lineups/bulk") && (init as RequestInit)?.method === "POST",
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ entries: [{ playerId: 11, lineupStatus: "REMPLACANT" }] });
    expect(toast.success).toHaveBeenCalled();
  });
});
