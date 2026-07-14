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
  return renderWithIntl(<SeasonsPageContent clubId={clubId} />);
}

describe("SeasonsPage (club-wide, révision A14-A17)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les saisons du club courant", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPage("1");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons",
        expect.anything(),
      );
    });
  });

  it("affiche un message si le club n'a aucune saison", async () => {
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

    renderPage("1");

    const activeLink = await screen.findByRole("link", { name: "Saison 2026-2027" });
    expect(activeLink).toHaveAttribute("href", "/clubs/1/seasons/10");
    expect(screen.getByText("01/08/2026 – 30/06/2027")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archivée")).toBeInTheDocument();
  });

  it("le bouton Nouvelle saison ouvre une modale de création (pas de navigation vers une page dédiée)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
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
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderPage("1");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 12 }));
      return Promise.resolve(jsonResponse([]));
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
      expect(mockApiFetch).toHaveBeenCalledWith("/clubs/1/seasons", expect.anything()),
    );
  });
});
