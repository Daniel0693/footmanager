import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { AbsenceTab } from "./absence-tab";

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

function absence(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    reason: "INJURY",
    description: "Douleur au genou droit",
    startDate: "2026-07-10T00:00:00.000Z",
    endDate: "2026-07-20T00:00:00.000Z",
    isExcused: true,
    reportedBy: { firstName: "Marie", lastName: "AdminClub" },
    ...overrides,
  };
}

function renderTab(
  clubId = "1",
  teamId = "5",
  playerId = "1",
  isOwnProfile = false,
) {
  return renderWithIntl(
    <AbsenceTab clubId={clubId} teamId={teamId} playerId={playerId} isOwnProfile={isOwnProfile} />,
  );
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("AbsenceTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les absences avec teamId en query et tri décroissant par défaut", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab("1", "5", "10");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toMatch(/^\/clubs\/1\/players\/10\/absences\?/);
    expect(queryOf(url).get("teamId")).toBe("5");
    expect(queryOf(url).get("sortOrder")).toBe("desc");
  });

  it("affiche un état vide quand il n'y a aucune absence", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    expect(
      await screen.findByText("Aucune absence enregistrée pour l'instant"),
    ).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(await screen.findByText("Impossible de charger les absences")).toBeInTheDocument();
  });

  it("affiche la timeline avec dates (JJ/MM/AAAA), motif traduit, description, statut d'excuse et auteur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence()]));

    renderTab();

    expect(await screen.findByText("Blessure")).toBeInTheDocument();
    expect(screen.getByText("Douleur au genou droit")).toBeInTheDocument();
    expect(screen.getByText("10/07/2026 – 20/07/2026")).toBeInTheDocument();
    expect(screen.getByText("Excusée")).toBeInTheDocument();
    expect(screen.getByText(/Signalée par Marie AdminClub/)).toBeInTheDocument();
  });

  it("n'affiche pas de description quand elle est absente", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence({ description: null })]));

    renderTab();

    await screen.findByText("Blessure");
    expect(screen.queryByText("Douleur au genou droit")).not.toBeInTheDocument();
  });

  it("affiche un badge Non excusée quand isExcused est false", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence({ isExcused: false })]));

    renderTab();

    await screen.findByText("Blessure");
    expect(screen.getByText("Non excusée")).toBeInTheDocument();
  });

  it("n'affiche aucun badge d'excuse quand isExcused est non renseigné", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence({ isExcused: null })]));

    renderTab();

    await screen.findByText("Blessure");
    expect(screen.queryByText("Excusée")).not.toBeInTheDocument();
    expect(screen.queryByText("Non excusée")).not.toBeInTheDocument();
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

  it("supprime une absence après confirmation et rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([absence()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Blessure");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(
      screen.getByText("Voulez-vous vraiment supprimer cette absence ? Cette action est irréversible."),
    ).toBeInTheDocument();
    // Pas de suppression tant que la confirmation n'est pas validée.
    expect(mockApiFetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/absences/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("Annuler referme la confirmation sans envoyer de DELETE", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence()]));
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Blessure");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("ajoute une absence via le dialogue puis rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse(absence()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
    await user.click(screen.getByRole("combobox", { name: "Motif" }));
    await user.click(await screen.findByRole("option", { name: "Maladie" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-08-05");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter" }),
    );

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/absences?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ouvre le dialogue d'édition pré-rempli depuis une entrée de la timeline", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([absence()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Blessure");

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(screen.getByRole("combobox", { name: "Motif" })).toHaveTextContent("Blessure");
    const descriptionInput = await screen.findByLabelText<HTMLTextAreaElement>("Description");
    expect(descriptionInput).toHaveValue("Douleur au genou droit");
  });

  describe("isOwnProfile (joueur consultant sa propre fiche)", () => {
    it("masque les boutons Modifier/Supprimer sur chaque absence", async () => {
      mockApiFetch.mockResolvedValue(jsonResponse([absence()]));

      renderTab("1", "5", "10", true);

      await screen.findByText("Blessure");
      expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    });

    it("le formulaire d'ajout ne propose pas le champ Excusé", async () => {
      mockApiFetch.mockResolvedValue(jsonResponse([]));
      const user = userEvent.setup();

      renderTab("1", "5", "10", true);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
      expect(screen.queryByRole("combobox", { name: "Excusée" })).not.toBeInTheDocument();
    });
  });
});
