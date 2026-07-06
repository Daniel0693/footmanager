import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { NotesTab } from "./notes-tab";

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

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    visibility: "SEMI_PRIVE",
    title: "Bilan technique",
    content: "Bonne progression sur les contrôles orientés",
    createdAt: "2026-01-15T00:00:00.000Z",
    author: { firstName: "Marie", lastName: "AdminClub" },
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", playerId = "1") {
  return renderWithIntl(<NotesTab clubId={clubId} teamId={teamId} playerId={playerId} />);
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("NotesTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les notes avec teamId en query et tri décroissant par défaut", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab("1", "5", "10");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toMatch(/^\/clubs\/1\/players\/10\/notes\?/);
    expect(queryOf(url).get("teamId")).toBe("5");
    expect(queryOf(url).get("sortOrder")).toBe("desc");
  });

  it("affiche un état vide quand il n'y a aucune note", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    expect(await screen.findByText("Aucune note enregistrée pour l'instant")).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(await screen.findByText("Impossible de charger les notes")).toBeInTheDocument();
  });

  it("affiche la timeline avec badge de visibilité, titre, contenu et auteur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([note()]));

    renderTab();

    expect(await screen.findByText("Bilan technique")).toBeInTheDocument();
    expect(
      screen.getByText("Bonne progression sur les contrôles orientés"),
    ).toBeInTheDocument();
    expect(screen.getByText("Semi-privé")).toBeInTheDocument();
    expect(screen.getByText(/Écrit par Marie AdminClub/)).toBeInTheDocument();
  });

  it("affiche le badge Privé pour une note dont la visibilité est PRIVE (staff uniquement)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([note({ visibility: "PRIVE", title: null })]));

    renderTab();

    expect(await screen.findByText("Privé")).toBeInTheDocument();
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

  it("supprime une note et rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([note()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Bilan technique");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/notes/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ajoute une note via le dialogue puis rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse(note()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter une note" }));
    await user.type(screen.getByLabelText("Contenu"), "Bonne séance");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/notes?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ouvre le dialogue d'édition pré-rempli depuis une entrée de la timeline", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([note()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Bilan technique");

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    const contentInput = await screen.findByLabelText<HTMLTextAreaElement>("Contenu");
    expect(contentInput).toHaveValue("Bonne progression sur les contrôles orientés");
  });
});
