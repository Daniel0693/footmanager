import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { TeamsPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function teamsResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderPage(clubId = "1") {
  return renderWithIntl(<TeamsPageContent clubId={clubId} />);
}

describe("TeamsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("appelle /clubs/:clubId/teams/mine (pas /teams) — régression du bug de navigation Coach", async () => {
    mockApiFetch.mockResolvedValue(teamsResponse([]));

    renderPage("1");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/mine",
        expect.anything(),
      );
    });
  });

  it("liste les équipes reçues, chacune avec un lien vers son effectif", async () => {
    mockApiFetch.mockResolvedValue(
      teamsResponse([
        { id: 1, name: "FE13 - Team Valais Central" },
        { id: 2, name: "U17 A" },
      ]),
    );

    renderPage("1");

    expect(await screen.findByText("FE13 - Team Valais Central")).toBeInTheDocument();
    expect(screen.getByText("U17 A")).toBeInTheDocument();
    const links = screen.getAllByRole("button", { name: "Voir l'effectif" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/clubs/1/teams/1/players");
    expect(links[1]).toHaveAttribute("href", "/clubs/1/teams/2/players");
  });

  it("affiche un message si le compte n'a accès à aucune équipe", async () => {
    mockApiFetch.mockResolvedValue(teamsResponse([]));

    renderPage("1");

    expect(await screen.findByText("Aucune équipe pour l'instant")).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue (pas un état silencieux)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage("1");

    expect(await screen.findByText("Impossible de charger les équipes")).toBeInTheDocument();
    expect(screen.queryByText("Aucune équipe pour l'instant")).not.toBeInTheDocument();
  });

  it("cache Créer une équipe et les menus Actions quand canManage est false (Coach)", async () => {
    mockApiFetch.mockResolvedValue(
      teamsResponse([{ id: 1, name: "U15 A" }], false),
    );

    renderPage("1");
    await screen.findByText("U15 A");

    expect(screen.queryByRole("button", { name: "Créer une équipe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("créer une équipe via la modale recharge la liste", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: 9, name: "Nouvelle équipe" }));
      }
      return Promise.resolve(teamsResponse([]));
    });

    renderPage("1");
    await screen.findByText("Aucune équipe pour l'instant");

    await user.click(screen.getByRole("button", { name: "Créer une équipe" }));
    await screen.findByRole("heading", { name: "Nouvelle équipe" });
    await user.type(screen.getByLabelText("Nom de l'équipe"), "Nouvelle équipe");
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: 9, name: "Nouvelle équipe" }));
      }
      return Promise.resolve(teamsResponse([{ id: 9, name: "Nouvelle équipe" }]));
    });
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText("Nouvelle équipe")).toBeInTheDocument();
  });

  it("Modifier ouvre la modale d'édition pré-remplie et enregistre le nouveau nom", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(teamsResponse([{ id: 1, name: "U15 A" }]));

    renderPage("1");
    await screen.findByText("U15 A");

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Modifier"));

    expect(await screen.findByRole("heading", { name: "Modifier l'équipe" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de l'équipe")).toHaveValue("U15 A");

    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ id: 1, name: "U15 B" }));
      }
      return Promise.resolve(teamsResponse([{ id: 1, name: "U15 B" }]));
    });
    await user.clear(screen.getByLabelText("Nom de l'équipe"));
    await user.type(screen.getByLabelText("Nom de l'équipe"), "U15 B");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "U15 B" }) }),
      ),
    );
  });

  it("Supprimer retire l'équipe après confirmation", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(teamsResponse([{ id: 1, name: "U15 A" }]));

    renderPage("1");
    await screen.findByText("U15 A");

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Supprimer"));

    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(teamsResponse([]));
    });
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText("Aucune équipe pour l'instant")).toBeInTheDocument();
  });
});
