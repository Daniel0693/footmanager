import { renderWithIntl, screen } from "@/test-utils/render";
import { NewSeasonPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("NewSeasonPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche le wizard de saison en mode création", () => {
    renderWithIntl(<NewSeasonPageContent clubId="1" teamId="5" />);

    expect(screen.getByRole("heading", { name: "Nouvelle saison" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de la saison")).toBeInTheDocument();
  });
});
