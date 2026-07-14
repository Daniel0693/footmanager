import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonsPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

// Résolution du teamId (pour `?teamId=`, requis par PermissionsGuard pour un
// Coach/Player en scope TEAM — voir seasons.controller.ts) testée séparément
// dans ses propres appelants ; mockée ici en valeur fixe, cette page ne
// teste que sa propre logique d'affichage/gating.
jest.mock("@/lib/resolve-any-team", () => ({
  resolveAnyTeamId: jest.fn(() => Promise.resolve("5")),
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
  return { ok, status: ok ? 200 : 403, json: () => Promise.resolve(body) };
}

function seasonsResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderPage(clubId = "1") {
  return renderWithIntl(<SeasonsPageContent clubId={clubId} />);
}

describe("SeasonsPage (club-wide, révision A14-A17)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token", user: { id: 1 } });
  });

  it("charge les saisons du club courant, en transmettant ?teamId= (requis pour un Coach/Player)", async () => {
    mockApiFetch.mockResolvedValue(seasonsResponse([]));

    renderPage("1");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons?teamId=5",
        expect.anything(),
      );
    });
  });

  it("affiche un message si le club n'a aucune saison", async () => {
    mockApiFetch.mockResolvedValue(seasonsResponse([]));

    renderPage();

    expect(await screen.findByText("Aucune saison pour l'instant")).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(
      await screen.findByText("Impossible de charger les saisons"),
    ).toBeInTheDocument();
  });

  it("liste les saisons avec leur statut, leurs dates et un lien vers le détail", async () => {
    mockApiFetch.mockResolvedValue(
      seasonsResponse([
        {
          id: 10,
          name: "Saison 2026-2027",
          startDate: "2026-08-01",
          endDate: "2027-06-30",
          status: "ACTIVE",
        },
        {
          id: 11,
          name: "Saison 2025-2026",
          startDate: "2025-08-01",
          endDate: "2026-06-30",
          status: "ARCHIVED",
        },
      ]),
    );

    renderPage("1");

    const activeLink = await screen.findByRole("link", { name: "Saison 2026-2027" });
    expect(activeLink).toHaveAttribute("href", "/clubs/1/seasons/10");
    expect(screen.getByText("01/08/2026 – 30/06/2027")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archivée")).toBeInTheDocument();
  });

  it("le bouton Nouvelle saison ouvre une modale de création (pas de navigation vers une page dédiée)", async () => {
    mockApiFetch.mockResolvedValue(seasonsResponse([]));
    const user = userEvent.setup();

    renderPage("1");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByRole("button", { name: "Nouvelle saison" }));

    expect(
      await screen.findByRole("heading", { name: "Nouvelle saison" }),
    ).toBeInTheDocument();
  });

  it("créer une saison via la modale rafraîchit la liste", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 12 }));
      return Promise.resolve(seasonsResponse([]));
    });
    const user = userEvent.setup();

    renderPage("1");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 12 }));
      return Promise.resolve(seasonsResponse([]));
    });

    await user.click(screen.getByRole("button", { name: "Nouvelle saison" }));
    await user.type(screen.getByLabelText("Nom de la saison"), "Saison 2026-2027");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // Rafraîchissement de la liste après succès (onSuccess), pas de redirection.
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons?teamId=5",
        expect.anything(),
      ),
    );
  });

  it("cache le bouton Nouvelle saison quand canManage est false (Coach/Player en lecture seule)", async () => {
    mockApiFetch.mockResolvedValue(seasonsResponse([], false));

    renderPage("1");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Nouvelle saison" })).not.toBeInTheDocument();
  });

  describe("colonne Actions", () => {
    const rows = [
      {
        id: 10,
        name: "Saison 2026-2027",
        startDate: "2026-08-01",
        endDate: "2027-06-30",
        status: "DRAFT",
      },
      {
        id: 9,
        name: "Saison 2025-2026",
        startDate: "2025-08-01",
        endDate: "2026-06-30",
        status: "ACTIVE",
      },
    ];

    it("n'affiche aucune colonne Actions quand canManage est false", async () => {
      mockApiFetch.mockResolvedValue(seasonsResponse(rows, false));

      renderPage("1");

      await screen.findByText("Saison 2026-2027");
      expect(screen.queryByText("Actions")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });

    it("propose Activer/Modifier/Supprimer pour la ligne DRAFT, pré-rempli avec la saison ACTIVE du club", async () => {
      mockApiFetch.mockResolvedValue(seasonsResponse(rows, true));
      const user = userEvent.setup();

      renderPage("1");
      await screen.findByText("Saison 2026-2027");

      const actionButtons = screen.getAllByRole("button", { name: "Actions" });
      expect(actionButtons).toHaveLength(2);

      // Ligne DRAFT (Saison 2026-2027) : Activer/Modifier/Supprimer.
      await user.click(actionButtons[0]);
      await user.click(await screen.findByText("Activer"));
      expect(
        await screen.findByText(/La saison « Saison 2025-2026 » sera archivée/),
      ).toBeInTheDocument();
      const endDateInput = await screen.findByLabelText("Date de fin de l'ancienne saison");
      expect(endDateInput).toHaveValue("2026-06-30");
    });
  });
});
