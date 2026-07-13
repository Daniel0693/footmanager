import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { EvaluationTab } from "./evaluation-tab";

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

const axesConfig = [
  {
    id: 1,
    categoryId: 1,
    name: "Technique",
    displayOrder: 1,
    criteria: [
      { id: 1, name: "Contrôle de balle", description: null },
      { id: 2, name: "Passe courte", description: null },
    ],
  },
  {
    id: 2,
    categoryId: 2,
    name: "Mental",
    displayOrder: 2,
    criteria: [{ id: 10, name: "Concentration", description: null }],
  },
];

function evaluation(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: "2026-06-01T00:00:00.000Z",
    comments: "Bon travail",
    evaluator: { firstName: "Daniel", lastName: "Coach" },
    scores: [
      {
        id: 1,
        criterionId: 1,
        score: "8",
        criterion: { id: 1, name: "Contrôle de balle", category: { id: 1, name: "Technique" } },
      },
      {
        id: 2,
        criterionId: 2,
        score: "6",
        criterion: { id: 2, name: "Passe courte", category: { id: 1, name: "Technique" } },
      },
      {
        id: 3,
        criterionId: 10,
        score: "10",
        criterion: { id: 10, name: "Concentration", category: { id: 2, name: "Mental" } },
      },
    ],
    ...overrides,
  };
}

function mockConfigAnd(evaluations: unknown[]) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/evaluation-config")) return Promise.resolve(jsonResponse(axesConfig));
    return Promise.resolve(jsonResponse(evaluations));
  });
}

function renderTab(
  clubId = "1",
  teamId = "5",
  playerId = "1",
  isOwnProfile = false,
  seasonId: number | null = null,
) {
  return renderWithIntl(
    <EvaluationTab
      clubId={clubId}
      teamId={teamId}
      playerId={playerId}
      isOwnProfile={isOwnProfile}
      seasonId={seasonId}
    />,
  );
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("EvaluationTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge la configuration du radar et les évaluations, toutes deux avec teamId en query", async () => {
    mockConfigAnd([]);

    renderTab("1", "5", "10");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const configCall = mockApiFetch.mock.calls.find(([url]) =>
      (url as string).includes("/evaluation-config"),
    );
    expect(configCall![0]).toBe("/clubs/1/evaluation-config?teamId=5");

    const evaluationCall = mockApiFetch.mock.calls.find(
      ([url]) => !(url as string).includes("/evaluation-config"),
    );
    expect(evaluationCall![0]).toMatch(/^\/clubs\/1\/players\/10\/evaluations\?/);
    expect(queryOf(evaluationCall![0] as string).get("teamId")).toBe("5");
    expect(queryOf(evaluationCall![0] as string).get("sortOrder")).toBe("desc");
  });

  it("affiche un message quand il n'y a pas assez de données pour le radar", async () => {
    mockConfigAnd([]);

    renderTab();

    expect(
      await screen.findByText("Pas encore assez de données pour afficher le radar"),
    ).toBeInTheDocument();
  });

  it("affiche un état vide pour l'historique quand il n'y a aucune évaluation", async () => {
    mockConfigAnd([]);

    renderTab();

    expect(
      await screen.findByText("Aucune évaluation enregistrée pour l'instant"),
    ).toBeInTheDocument();
  });

  it("affiche l'historique en tableau : une ligne par évaluation, une colonne par catégorie (moyenne)", async () => {
    mockConfigAnd([evaluation()]);

    renderTab();

    await screen.findByText(/1 juin 2026/);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Technique")).toBeInTheDocument();
    expect(within(table).getByText("Mental")).toBeInTheDocument();
    // Technique = moyenne(8, 6) = 7.0 ; Mental = 10.0 — chiffre seul, sans étoiles
    // (retour du 2026-07-06 : le tableau était trop étiré avec les étoiles)
    expect(within(table).getByText("7.0")).toBeInTheDocument();
    expect(within(table).getByText("10.0")).toBeInTheDocument();
    expect(within(table).getByText(/Daniel Coach/)).toBeInTheDocument();
  });

  it("ne montre plus le message vide du radar une fois qu'une évaluation existe", async () => {
    mockConfigAnd([evaluation()]);

    renderTab();

    await screen.findByText(/1 juin 2026/);
    expect(
      screen.queryByText("Pas encore assez de données pour afficher le radar"),
    ).not.toBeInTheDocument();
  });

  it("changer les filtres de date refetch l'historique avec dateFrom/dateTo", async () => {
    mockConfigAnd([]);
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    mockApiFetch.mockClear();

    await user.type(screen.getByLabelText("Du"), "2026-01-01");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url as string).get("dateFrom")).toBe("2026-01-01");
  });

  it("changer le tri refetch avec sortOrder=asc", async () => {
    mockConfigAnd([]);
    const user = userEvent.setup();

    renderTab();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Plus récent d'abord"));
    await user.click(await screen.findByRole("option", { name: "Plus ancien d'abord" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url as string).get("sortOrder")).toBe("asc");
  });

  it("supprime une évaluation et rafraîchit le tableau", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/evaluation-config")) return Promise.resolve(jsonResponse(axesConfig));
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([evaluation()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText(/1 juin 2026/);
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/evaluations/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ajoute une évaluation via le dialogue puis rafraîchit le tableau", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/evaluation-config")) return Promise.resolve(jsonResponse(axesConfig));
      if (options?.method === "POST") return Promise.resolve(jsonResponse(evaluation()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter une évaluation" }));
    await user.type(screen.getByLabelText("Date"), "2026-06-20");
    await user.click(screen.getByRole("button", { name: "Contrôle de balle : 8 sur 10" }));
    await user.click(screen.getByRole("button", { name: "Passe courte : 6 sur 10" }));
    await user.click(screen.getByRole("button", { name: "Concentration : 10 sur 10" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/evaluations?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ouvre le dialogue d'édition pré-rempli depuis une ligne du tableau", async () => {
    mockConfigAnd([evaluation()]);
    const user = userEvent.setup();

    renderTab();
    await screen.findByText(/1 juin 2026/);

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(
      await screen.findByRole("button", { name: "Contrôle de balle : 8 sur 10" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText<HTMLInputElement>("Date")).toHaveValue("2026-06-01");
  });

  it("filtrage par saison (A12) : envoie seasonId et masque la plage de dates libre", async () => {
    mockConfigAnd([]);

    renderTab("1", "5", "10", false, 42);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [url] = mockApiFetch.mock.calls.find(
      ([callUrl]) => !(callUrl as string).includes("/evaluation-config"),
    ) as [string];
    expect(queryOf(url).get("seasonId")).toBe("42");
    expect(queryOf(url).get("dateFrom")).toBeNull();
    expect(queryOf(url).get("dateTo")).toBeNull();
    expect(screen.queryByLabelText("Du")).not.toBeInTheDocument();
  });

  it("isOwnProfile masque le bouton Ajouter et les actions Modifier/Supprimer par ligne (Player n'a que READ/OWN)", async () => {
    mockConfigAnd([evaluation()]);

    renderTab("1", "5", "10", true);

    await screen.findByText(/1 juin 2026/);
    expect(screen.queryByRole("button", { name: "Ajouter une évaluation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  });
});
