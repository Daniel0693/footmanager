import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { TeamPlayersPageContent } from "./page";

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

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

function player(
  id: number,
  firstName: string,
  mainPosition: string | null,
  jerseyNumber: number | null = id,
) {
  return {
    id,
    jerseyNumber,
    mainPosition,
    secondaryPositions: [],
    player: { id, member: { firstName, lastName: "Test" } },
  };
}

function renderPage(clubId = "1", teamId = "1") {
  return renderWithIntl(<TeamPlayersPageContent clubId={clubId} teamId={teamId} />);
}

describe("TeamPlayersPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("appelle le bon endpoint (club + équipe précis)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage("1", "5");

    await screen.findByText("Aucun joueur dans cette équipe");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/players",
      expect.anything(),
    );
  });

  it("liste les joueurs reçus avec leur numéro, nom et poste", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([player(1, "Tom", "CAM", 10), player(2, "Luc", "GK", 1)]),
    );

    renderPage();

    // {firstName} {lastName} rend "Tom" et "Test" comme deux nœuds texte
    // distincts : on matche le texte normalisé complet du <td>, pas "Tom" seul.
    expect(await screen.findByText("Tom Test")).toBeInTheDocument();
    expect(screen.getByText("Luc Test")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Milieu offensif")).toBeInTheDocument();
    expect(screen.getByText("Gardien")).toBeInTheDocument();
  });

  it("affiche un message si l'équipe n'a aucun joueur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage();

    expect(await screen.findByText("Aucun joueur dans cette équipe")).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue — régression du bug Joueur/permissions", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(await screen.findByText("Impossible de charger l'effectif")).toBeInTheDocument();
    // Pas de tableau vide silencieux : ni la ligne d'en-tête ni "Aucun joueur"
    // ne doivent apparaître en même temps que le message d'erreur.
    expect(screen.queryByText("Aucun joueur dans cette équipe")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("les filtres affichent \"Toutes les lignes\"/\"Tous les postes\" par défaut, pas la valeur brute \"ALL\" — régression du bug d'affichage", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([player(1, "Tom", "CAM")]));

    renderPage();
    await screen.findByText("Tom Test");

    expect(screen.getByText("Toutes les lignes")).toBeInTheDocument();
    expect(screen.getByText("Tous les postes")).toBeInTheDocument();
    expect(screen.queryByText("ALL")).not.toBeInTheDocument();
  });

  it("le filtre par ligne est résolu côté backend (query params `position`), pas par un filtrage JS côté client", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([player(1, "Tom", "CAM")]));
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Tom Test");
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Toutes les lignes"));
    await user.click(await screen.findByRole("option", { name: "Milieu" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).getAll("position")).toEqual(["CDM", "CM", "RM", "LM", "CAM"]);
  });

  it("le filtre par poste précis n'envoie que ce poste, même si une ligne est déjà sélectionnée", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([player(1, "Tom", "CAM")]));
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Tom Test");

    await user.click(screen.getByText("Toutes les lignes"));
    await user.click(await screen.findByRole("option", { name: "Milieu" }));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Tous les postes"));
    await user.click(await screen.findByRole("option", { name: "Milieu offensif" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).getAll("position")).toEqual(["CAM"]);
  });

  it("un joueur sans poste renseigné affiche un tiret plutôt que de planter", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([player(1, "Tom", null, null)]));

    renderPage();

    const row = (await screen.findByText("Tom Test")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByText("—")).toHaveLength(3);
  });

  it("le nom du joueur pointe vers sa fiche (club + équipe + id du profil joueur)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([player(7, "Tom", "CAM")]));

    renderPage("1", "5");

    const link = await screen.findByRole("link", { name: "Tom Test" });
    expect(link).toHaveAttribute("href", "/clubs/1/teams/5/players/7");
  });

  it("le bouton \"Ajouter un joueur\" est affiché sur la page effectif", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage();

    expect(await screen.findByRole("button", { name: "Ajouter un joueur" })).toBeInTheDocument();
  });
});
