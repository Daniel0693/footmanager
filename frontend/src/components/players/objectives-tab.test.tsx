import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { ObjectivesTab } from "./objectives-tab";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function objective(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    theme: "TECHNIQUE",
    description: "Améliorer les contrôles orientés",
    horizon: "MID_TERM",
    status: "PLANNED",
    visibility: "SEMI_PRIVE",
    startDate: null,
    dueDate: "2026-06-30T00:00:00.000Z",
    completedDate: null,
    assignedBy: { firstName: "Marie", lastName: "AdminClub" },
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", playerId = "1") {
  return renderWithIntl(<ObjectivesTab clubId={clubId} teamId={teamId} playerId={playerId} />);
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("ObjectivesTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les objectifs avec teamId en query, sans filtre de statut et tri décroissant par défaut", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab("1", "5", "10");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toMatch(/^\/clubs\/1\/players\/10\/objectives\?/);
    expect(queryOf(url).get("teamId")).toBe("5");
    expect(queryOf(url).get("status")).toBeNull();
    expect(queryOf(url).get("sortOrder")).toBe("desc");
  });

  it("affiche un état vide quand il n'y a aucun objectif", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    expect(
      await screen.findByText("Aucun objectif enregistré pour l'instant"),
    ).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(await screen.findByText("Impossible de charger les objectifs")).toBeInTheDocument();
  });

  it("affiche la timeline avec statut, thème, horizon, description, échéance et auteur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([objective()]));

    renderTab();

    expect(await screen.findByText("Améliorer les contrôles orientés")).toBeInTheDocument();
    expect(screen.getByText("Programmé")).toBeInTheDocument();
    expect(screen.getByText("Technique")).toBeInTheDocument();
    expect(screen.getByText("Moyen terme")).toBeInTheDocument();
    expect(screen.getByText(/Échéance : 30 juin 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Assigné par Marie AdminClub/)).toBeInTheDocument();
  });

  it("affiche un badge Privé pour un objectif dont la visibilité est PRIVE (staff uniquement)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([objective({ visibility: "PRIVE" })]));

    renderTab();

    await screen.findByText("Améliorer les contrôles orientés");
    expect(screen.getByText("Privé")).toBeInTheDocument();
  });

  it("changer le filtre de statut refetch avec status=ACHIEVED", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Tous les statuts"));
    await user.click(await screen.findByRole("option", { name: "Réussi" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("status")).toBe("ACHIEVED");
  });

  it("changer le filtre de thème refetch avec theme=PHYSIQUE", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Tous les thèmes"));
    await user.click(await screen.findByRole("option", { name: "Physique" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("theme")).toBe("PHYSIQUE");
  });

  it("changer les filtres de date refetch avec dateFrom/dateTo", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.type(screen.getByLabelText("Du"), "2026-01-01");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("dateFrom")).toBe("2026-01-01");
  });

  it("changer le tri refetch avec sortOrder=asc", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Plus récent d'abord"));
    await user.click(await screen.findByRole("option", { name: "Plus ancien d'abord" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("sortOrder")).toBe("asc");
  });

  it("supprime un objectif et rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([objective()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Améliorer les contrôles orientés");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/objectives/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ajoute un objectif via le dialogue puis rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse(objective()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter un objectif" }));
    await user.type(screen.getByLabelText("Description"), "Nouvel objectif");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter" }),
    );

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/objectives?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ouvre le dialogue d'édition pré-rempli depuis une entrée de la timeline", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([objective()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Améliorer les contrôles orientés");

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    const descriptionInput = await screen.findByLabelText<HTMLTextAreaElement>("Description");
    expect(descriptionInput).toHaveValue("Améliorer les contrôles orientés");
  });
});
