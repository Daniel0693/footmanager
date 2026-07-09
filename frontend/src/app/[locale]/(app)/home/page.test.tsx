import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import HomePage from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

describe("HomePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: "alice@test.com" },
      accessToken: "token",
      logout: jest.fn(),
    });
  });

  it("propose de créer un club quand le compte n'appartient à aucun club", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderWithIntl(<HomePage />);

    expect(await screen.findByRole("button", { name: "Créer un club" })).toBeInTheDocument();
    expect(screen.queryByText(/Voir l'effectif de/)).not.toBeInTheDocument();
  });

  it("propose de voir l'effectif — pas de créer un club — quand le compte appartient déjà à un club", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([{ id: 1, name: "AVF" }]));

    renderWithIntl(<HomePage />);

    expect(await screen.findByText("Voir l'effectif de AVF")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer un club" })).not.toBeInTheDocument();
  });

  it("le lien \"Voir l'effectif\" pointe vers le bon club (régression du bug de navigation)", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        { id: 42, name: "AVF" },
        { id: 7, name: "Club Test" },
      ]),
    );

    renderWithIntl(<HomePage />);

    // Rendu en <a href> (Link) mais exposé en role="button" par Base UI
    // (voir le composant Button, render + nativeButton={false}).
    const avfLink = await screen.findByRole("button", { name: "Voir l'effectif de AVF" });
    expect(avfLink).toHaveAttribute("href", "/clubs/42/teams");
    const otherLink = screen.getByRole("button", { name: "Voir l'effectif de Club Test" });
    expect(otherLink).toHaveAttribute("href", "/clubs/7/teams");
  });

  it("un compte avec plusieurs clubs voit un lien par club, pas un seul mélangé", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        { id: 1, name: "AVF" },
        { id: 2, name: "FC Sion" },
      ]),
    );

    renderWithIntl(<HomePage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Voir l'effectif de/ })).toHaveLength(2);
    });
  });

  it("si le chargement des clubs échoue, ne plante pas et retombe sur \"Créer un club\"", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderWithIntl(<HomePage />);

    expect(await screen.findByRole("button", { name: "Créer un club" })).toBeInTheDocument();
  });
});
