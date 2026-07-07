import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { UserMenu } from "./user-menu";

const mockLogout = jest.fn();
const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("UserMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 1, email: "alice@test.com" },
      logout: mockLogout,
    });
  });

  it("ne rend rien tant qu'aucun utilisateur n'est connecté", () => {
    mockUseAuth.mockReturnValue({ user: null, logout: mockLogout });
    const { container } = renderWithIntl(<UserMenu />);

    expect(container).toBeEmptyDOMElement();
  });

  it("affiche l'email connecté et appelle logout() au clic sur Se déconnecter", async () => {
    const user = userEvent.setup();
    renderWithIntl(<UserMenu />);

    await user.click(screen.getByRole("button", { name: "alice@test.com" }));

    expect(await screen.findByText("alice@test.com")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
