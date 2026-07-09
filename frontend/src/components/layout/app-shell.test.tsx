import { render, screen } from "@testing-library/react";
import { replace } from "@/test-utils/navigation-mock";
import { AppShell } from "./app-shell";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

jest.mock("./sidebar-nav", () => ({
  SidebarNav: () => <div data-testid="sidebar-nav" />,
}));
jest.mock("./site-header", () => ({
  SiteHeader: () => <div data-testid="site-header" />,
}));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("AppShell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ne rend rien pendant le chargement de la session", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    render(
      <AppShell>
        <div>Contenu</div>
      </AppShell>,
    );

    expect(screen.queryByText("Contenu")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-nav")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirige vers /login si le chargement est terminé sans utilisateur", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    render(
      <AppShell>
        <div>Contenu</div>
      </AppShell>,
    );

    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Contenu")).not.toBeInTheDocument();
  });

  it("rend la sidebar, le header et les enfants une fois l'utilisateur chargé", () => {
    mockUseAuth.mockReturnValue({ user: { id: 1 }, isLoading: false });

    render(
      <AppShell>
        <div>Contenu</div>
      </AppShell>,
    );

    expect(screen.getByText("Contenu")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-nav")).toBeInTheDocument();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
