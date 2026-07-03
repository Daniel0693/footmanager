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

function renderPage(clubId = "1") {
  return renderWithIntl(<TeamsPageContent clubId={clubId} />);
}

describe("TeamsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("appelle /clubs/:clubId/teams/mine (pas /teams) — régression du bug de navigation Coach", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

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
      jsonResponse([
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
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage("1");

    expect(await screen.findByText("Aucune équipe pour l'instant")).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue (pas un état silencieux)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage("1");

    expect(await screen.findByText("Impossible de charger les équipes")).toBeInTheDocument();
    expect(screen.queryByText("Aucune équipe pour l'instant")).not.toBeInTheDocument();
  });

  it("créer une équipe recharge la liste", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse([])) // chargement initial
      .mockResolvedValueOnce(jsonResponse({ id: 9, name: "Nouvelle équipe" })) // POST
      .mockResolvedValueOnce(jsonResponse([{ id: 9, name: "Nouvelle équipe" }])); // rechargement

    renderPage("1");
    await screen.findByText("Aucune équipe pour l'instant");

    await user.type(screen.getByLabelText("Nom de l'équipe"), "Nouvelle équipe");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText("Nouvelle équipe")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/teams",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
