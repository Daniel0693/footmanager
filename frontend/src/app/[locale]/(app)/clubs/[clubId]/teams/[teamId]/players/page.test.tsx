import { act, fireEvent } from "@testing-library/react";
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
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

const CAPABILITIES = {
  canViewArchived: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function rosterResponse(
  data: unknown[],
  total = data.length,
  capabilities: Partial<typeof CAPABILITIES> = {},
) {
  return jsonResponse({ data, total, ...CAPABILITIES, ...capabilities });
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    memberId: 10,
    playerId: 100,
    role: "PLAYER",
    firstName: "Tom",
    lastName: "Test",
    phone: null,
    email: null,
    birthDate: null,
    jerseyNumber: 1,
    mainPosition: null,
    secondaryPositions: [],
    isArchived: false,
    ...overrides,
  };
}

function staffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 900,
    memberId: 90,
    playerId: null,
    role: "PRINCIPAL",
    firstName: "Alice",
    lastName: "Coach",
    phone: null,
    email: null,
    birthDate: null,
    jerseyNumber: null,
    mainPosition: null,
    secondaryPositions: [],
    isArchived: false,
    ...overrides,
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

  it("appelle le bon endpoint (club + équipe précis) avec les paramètres par défaut", async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([]));

    renderPage("1", "5");

    await screen.findByText("Aucun membre dans cette équipe");
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/clubs/1/teams/5/roster?"),
      expect.anything(),
    );
    const [url] = mockApiFetch.mock.calls[0];
    const query = queryOf(url as string);
    expect(query.get("status")).toBe("ACTIVE");
    expect(query.get("sortBy")).toBe("lastName");
    expect(query.get("sortOrder")).toBe("asc");
    expect(query.get("page")).toBe("1");
    expect(query.get("pageSize")).toBe("20");
  });

  it("liste joueurs ET staff dans un même tableau, avec leurs colonnes respectives", async () => {
    mockApiFetch.mockResolvedValue(
      rosterResponse([
        playerRow({ firstName: "Karim", lastName: "Benali", jerseyNumber: 9 }),
        staffRow({ firstName: "Alice", lastName: "Coach" }),
      ]),
    );

    renderPage();

    expect(await screen.findByText("Benali")).toBeInTheDocument();
    expect(screen.getByText("Karim")).toBeInTheDocument();
    expect(screen.getByText("Coach")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Joueur")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
  });

  it("affiche un message si l'équipe n'a aucun membre", async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([]));

    renderPage();

    expect(await screen.findByText("Aucun membre dans cette équipe")).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(await screen.findByText("Impossible de charger l'effectif")).toBeInTheDocument();
    expect(screen.queryByText("Aucun membre dans cette équipe")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("le filtre par ligne est résolu côté backend (query params `position`), pas par un filtrage JS côté client", async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Test");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: /Filtres/ }));
    await user.click(await screen.findByText("Toutes les lignes"));
    await user.click(await screen.findByRole("option", { name: "Milieu" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url as string).getAll("position")).toEqual(["CDM", "CM", "RM", "LM", "CAM"]);
  });

  it("un membre sans téléphone/email/date de naissance affiche un tiret plutôt que de planter", async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));

    renderPage();

    const row = (await screen.findByText("Test")).closest("tr");
    expect(row).not.toBeNull();
    // phone, email, birthDate, poste principal, postes secondaires : 5 tirets.
    expect(within(row as HTMLElement).getAllByText("—")).toHaveLength(5);
  });

  it("le nom d'un joueur pointe vers sa fiche (playerId), pas le nom d'un membre du staff", async () => {
    mockApiFetch.mockResolvedValue(
      rosterResponse([playerRow({ playerId: 7 }), staffRow()]),
    );

    renderPage("1", "5");

    const link = await screen.findByRole("link", { name: "Test" });
    expect(link).toHaveAttribute("href", "/clubs/1/teams/5/players/7");
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
  });

  it('le bouton "Ajouter un joueur" est affiché quand canCreate est vrai', async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([], 0, { canCreate: true }));

    renderPage();

    expect(await screen.findByRole("button", { name: "Ajouter un joueur" })).toBeInTheDocument();
  });

  it('le bouton "Ajouter un joueur" est masqué quand canCreate est faux (ex. Player)', async () => {
    mockApiFetch.mockResolvedValue(rosterResponse([], 0, { canCreate: false }));

    renderPage();

    await screen.findByText("Aucun membre dans cette équipe");
    expect(screen.queryByRole("button", { name: "Ajouter un joueur" })).not.toBeInTheDocument();
  });

  describe("filtre statut Actif/Archivé/Tout", () => {
    it("le filtre Statut est affiché quand canViewArchived est vrai", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([], 0, { canViewArchived: true }));
      const user = userEvent.setup();

      renderPage();
      await user.click(await screen.findByRole("button", { name: /Filtres/ }));

      expect(await screen.findByText("Statut")).toBeInTheDocument();
    });

    it("le filtre Statut est masqué quand canViewArchived est faux (ex. Player)", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([], 0, { canViewArchived: false }));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Aucun membre dans cette équipe");
      await user.click(screen.getByRole("button", { name: /Filtres/ }));

      expect(await screen.findByText("Toutes les lignes")).toBeInTheDocument();
      expect(screen.queryByText("Statut")).not.toBeInTheDocument();
    });

    it("changer le filtre Statut relance la requête avec le bon paramètre et remet la pagination à 1", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: /Filtres/ }));
      await user.click(await screen.findByText("Actifs"));
      await user.click(await screen.findByRole("option", { name: "Archivés" }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      const [url] = mockApiFetch.mock.calls[0];
      const query = queryOf(url as string);
      expect(query.get("status")).toBe("ARCHIVED");
      expect(query.get("page")).toBe("1");
    });
  });

  describe("tri par en-tête de colonne", () => {
    it("cliquer sur un en-tête trie par cette colonne, ascendant par défaut", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: /N°/ }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      const [url] = mockApiFetch.mock.calls[0];
      const query = queryOf(url as string);
      expect(query.get("sortBy")).toBe("jerseyNumber");
      expect(query.get("sortOrder")).toBe("asc");
    });

    it("cliquer une seconde fois sur la même colonne inverse le sens", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: /N°/ }));
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: /N°/ }));
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      const [url] = mockApiFetch.mock.calls[0];
      expect(queryOf(url as string).get("sortOrder")).toBe("desc");
    });

    it.each([
      ["Prénom", "firstName"],
      ["Poste principal", "mainPosition"],
      ["Postes secondaires", "secondaryPositions"],
    ])(
      "l'en-tête %s est triable (retour utilisateur 2026-07-13) → sortBy=%s",
      async (label, expectedSortBy) => {
        mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
        const user = userEvent.setup();

        renderPage();
        await screen.findByText("Test");
        mockApiFetch.mockClear();

        await user.click(screen.getByRole("button", { name: new RegExp(label) }));

        await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
        const [url] = mockApiFetch.mock.calls[0];
        const query = queryOf(url as string);
        expect(query.get("sortBy")).toBe(expectedSortBy);
        expect(query.get("sortOrder")).toBe("asc");
      },
    );
  });

  describe("panneau Filtres compact (retour utilisateur 2026-07-13)", () => {
    it("le bouton Filtres n'affiche aucun badge quand aucun filtre n'est actif", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));

      renderPage();
      await screen.findByText("Test");

      const filtersButton = screen.getByRole("button", { name: /Filtres/ });
      expect(within(filtersButton).queryByText("1")).not.toBeInTheDocument();
    });

    it("le badge de comptage reflète le nombre de filtres actifs et le panneau reste ouvert après une sélection", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: /Filtres/ }));
      await user.click(await screen.findByText("Toutes les lignes"));
      await user.click(await screen.findByRole("option", { name: "Milieu" }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      // Le panneau n'est pas refermé par la sélection (comportement Popover,
      // pas Menu) : le filtre Poste reste visible juste après.
      expect(screen.getByText("Filtrer par poste")).toBeInTheDocument();
      const filtersButton = screen.getByRole("button", { name: /Filtres/ });
      expect(within(filtersButton).getByText("1")).toBeInTheDocument();
    });
  });

  describe("recherche texte (retour utilisateur 2026-07-13)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("un seul fetch après 300ms d'inactivité, pas un par frappe", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      const input = screen.getByPlaceholderText("Rechercher un joueur...");
      fireEvent.change(input, { target: { value: "D" } });
      fireEvent.change(input, { target: { value: "Da" } });
      fireEvent.change(input, { target: { value: "Dan" } });

      expect(mockApiFetch).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      const [url] = mockApiFetch.mock.calls[0];
      expect(queryOf(url as string).get("search")).toBe("Dan");
    });

    it("une recherche vide n'envoie pas le paramètre search", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()]));
      renderPage();
      await screen.findByText("Test");
      mockApiFetch.mockClear();

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      // Aucune frappe : le debounce initial ne doit provoquer aucun fetch
      // supplémentaire (page déjà à 1).
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe("pagination", () => {
    it("affiche les contrôles de pagination et la taille de page", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()], 45));

      renderPage();

      expect(await screen.findByText("Page 1 sur 3")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
    });

    it("cliquer sur Suivant demande la page 2", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()], 45));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Page 1 sur 3");
      mockApiFetch.mockClear();

      await user.click(screen.getByRole("button", { name: "Suivant" }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      const [url] = mockApiFetch.mock.calls[0];
      expect(queryOf(url as string).get("page")).toBe("2");
    });

    it("changer la taille de page relance la requête et remet la pagination à 1", async () => {
      mockApiFetch.mockResolvedValue(rosterResponse([playerRow()], 45));
      const user = userEvent.setup();

      renderPage();
      await screen.findByText("Page 1 sur 3");
      mockApiFetch.mockClear();

      // "20" (taille de page courante) est la seule occurrence de ce texte à
      // l'écran ici — plusieurs <Select> coexistent (ligne/poste/statut), on
      // ne peut pas cibler celui-ci via getByRole("combobox") seul (ambigu).
      await user.click(screen.getByText("20"));
      await user.click(await screen.findByRole("option", { name: "50" }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      const [url] = mockApiFetch.mock.calls[0];
      const query = queryOf(url as string);
      expect(query.get("pageSize")).toBe("50");
      expect(query.get("page")).toBe("1");
    });
  });
});
