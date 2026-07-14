import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { usePathname } from "@/test-utils/navigation-mock";
import { SidebarNav } from "./sidebar-nav";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

const mockUseParams = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockGetLastTeam = jest.fn();
const mockSetLastTeam = jest.fn();
jest.mock("@/lib/last-team", () => ({
  getLastTeam: (...args: unknown[]) => mockGetLastTeam(...args),
  setLastTeam: (...args: unknown[]) => mockSetLastTeam(...args),
}));

// Vérification d'accès à `season` (masquage du lien "Saisons" pour un rôle
// sans aucun droit de lecture dessus, ex. Parent — voir seasons.controller.ts)
// : mockée en succès par défaut (lien affiché), un test dédié simule le 403.
const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}));
jest.mock("@/lib/resolve-any-team", () => ({
  resolveAnyTeamId: jest.fn(() => Promise.resolve("7")),
}));

describe("SidebarNav", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({});
    mockUseAuth.mockReturnValue({ user: { id: 1 }, accessToken: "token" });
    mockGetLastTeam.mockReturnValue(null);
    mockApiFetch.mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve({}) });
  });

  it("affiche les modules existants avec leurs libellés", () => {
    usePathname.mockReturnValue("/home");
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Accueil" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Effectif" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendrier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saisons" })).toBeInTheDocument();
  });

  it("le lien Effectif renvoie vers /home quand aucun club n'est sélectionné", () => {
    usePathname.mockReturnValue("/home");
    mockUseParams.mockReturnValue({});
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Effectif" })).toHaveAttribute("href", "/home");
  });

  it("le lien Effectif devient contextuel dès qu'un club/équipe est dans l'URL", () => {
    usePathname.mockReturnValue("/clubs/42/teams/7/players");
    mockUseParams.mockReturnValue({ clubId: "42", teamId: "7" });
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Effectif" })).toHaveAttribute(
      "href",
      "/clubs/42/teams/7/players",
    );
  });

  it("marque l'entrée active via aria-current selon le pathname courant", () => {
    usePathname.mockReturnValue("/clubs/42/teams");
    mockUseParams.mockReturnValue({ clubId: "42" });
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Effectif" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("aria-current");
  });

  it("le lien Saisons devient contextuel dès qu'un club est dans l'URL (club-wide, pas besoin de teamId)", () => {
    usePathname.mockReturnValue("/clubs/42/seasons");
    mockUseParams.mockReturnValue({ clubId: "42" });
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Saisons" })).toHaveAttribute(
      "href",
      "/clubs/42/seasons",
    );
  });

  it("marque Saisons comme actif (et pas Effectif) sur une route /seasons", () => {
    usePathname.mockReturnValue("/clubs/42/seasons");
    mockUseParams.mockReturnValue({ clubId: "42" });
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Saisons" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Effectif" })).not.toHaveAttribute("aria-current");
  });

  it("cache le lien Saisons pour un membre sans aucun droit de lecture dessus (ex. Parent, 403)", async () => {
    usePathname.mockReturnValue("/clubs/42/teams");
    mockUseParams.mockReturnValue({ clubId: "42" });
    mockApiFetch.mockResolvedValue({ status: 403, ok: false, json: () => Promise.resolve({}) });

    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Effectif" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Saisons" })).not.toBeInTheDocument(),
    );
  });

  it("appelle onNavigate quand un lien est cliqué (fermeture de la sidebar mobile)", async () => {
    usePathname.mockReturnValue("/home");
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    renderWithIntl(<SidebarNav open onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Accueil" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  describe("mémorisation de la dernière équipe visitée", () => {
    it("mémorise l'équipe courante quand teamId est présent dans l'URL", () => {
      usePathname.mockReturnValue("/clubs/42/teams/7/players");
      mockUseParams.mockReturnValue({ clubId: "42", teamId: "7" });
      renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

      expect(mockSetLastTeam).toHaveBeenCalledWith(1, "42", "7");
    });

    it("complète Effectif avec la dernière équipe visitée depuis une page sans teamId (ex. Calendrier) ; Saisons n'en a pas besoin (club-wide)", () => {
      mockGetLastTeam.mockReturnValue({ clubId: "42", teamId: "7" });
      usePathname.mockReturnValue("/clubs/42/calendar");
      mockUseParams.mockReturnValue({ clubId: "42" });
      renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

      expect(screen.getByRole("link", { name: "Effectif" })).toHaveAttribute(
        "href",
        "/clubs/42/teams/7/players",
      );
      expect(screen.getByRole("link", { name: "Saisons" })).toHaveAttribute(
        "href",
        "/clubs/42/seasons",
      );
      expect(mockSetLastTeam).not.toHaveBeenCalled();
    });

    it("ignore la dernière équipe mémorisée si elle appartient à un autre club (Effectif seul concerné)", () => {
      mockGetLastTeam.mockReturnValue({ clubId: "99", teamId: "7" });
      usePathname.mockReturnValue("/clubs/42/calendar");
      mockUseParams.mockReturnValue({ clubId: "42" });
      renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

      expect(screen.getByRole("link", { name: "Effectif" })).toHaveAttribute(
        "href",
        "/clubs/42/teams",
      );
      expect(screen.getByRole("link", { name: "Saisons" })).toHaveAttribute(
        "href",
        "/clubs/42/seasons",
      );
    });
  });
});
