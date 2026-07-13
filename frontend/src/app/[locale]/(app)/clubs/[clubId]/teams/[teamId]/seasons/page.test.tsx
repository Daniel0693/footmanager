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

function renderPage(clubId = "1", teamId = "5") {
  return renderWithIntl(<SeasonsPageContent clubId={clubId} teamId={teamId} />);
}

describe("SeasonsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les saisons de l'équipe courante", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage("1", "5");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/seasons",
        expect.anything(),
      );
    });
  });

  it("affiche un message si l'équipe n'a aucune saison", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

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
      jsonResponse([
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

    renderPage("1", "5");

    const activeLink = await screen.findByRole("link", { name: "Saison 2026-2027" });
    expect(activeLink).toHaveAttribute("href", "/clubs/1/teams/5/seasons/10");
    expect(screen.getByText("01/08/2026 – 30/06/2027")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archivée")).toBeInTheDocument();
  });

  it("affiche le bouton \"Continuer la configuration\" uniquement sur les saisons DRAFT", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 12,
          name: "Saison en préparation",
          startDate: "2027-08-01",
          endDate: "2028-06-30",
          status: "DRAFT",
        },
        {
          id: 10,
          name: "Saison active",
          startDate: "2026-08-01",
          endDate: "2027-06-30",
          status: "ACTIVE",
        },
      ]),
    );

    renderPage("1", "5");

    // Button rendu via render={<Link .../>} expose role="button", pas
    // "link" (piège Base UI documenté dans docs/architecture.md §6).
    const continueButtons = await screen.findAllByRole("button", {
      name: "Continuer la configuration",
    });
    expect(continueButtons).toHaveLength(1);
    expect(continueButtons[0]).toHaveAttribute(
      "href",
      "/clubs/1/teams/5/seasons/12/wizard",
    );
  });

  it("le bouton Nouvelle saison renvoie vers l'assistant de création", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage("1", "5");

    expect(
      await screen.findByRole("button", { name: "Nouvelle saison" }),
    ).toHaveAttribute("href", "/clubs/1/teams/5/seasons/new");
  });
});
