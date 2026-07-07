import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { usePathname } from "@/test-utils/navigation-mock";
import { SidebarNav } from "./sidebar-nav";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

const mockUseParams = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

describe("SidebarNav", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({});
  });

  it("affiche les deux modules existants avec leurs libellés", () => {
    usePathname.mockReturnValue("/home");
    renderWithIntl(<SidebarNav open onNavigate={jest.fn()} />);

    expect(screen.getByRole("link", { name: "Accueil" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Effectif" })).toBeInTheDocument();
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

  it("appelle onNavigate quand un lien est cliqué (fermeture de la sidebar mobile)", async () => {
    usePathname.mockReturnValue("/home");
    const onNavigate = jest.fn();
    const user = userEvent.setup();
    renderWithIntl(<SidebarNav open onNavigate={onNavigate} />);

    await user.click(screen.getByRole("link", { name: "Accueil" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
