import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { replace, usePathname } from "@/test-utils/navigation-mock";
import { LanguageSwitcher } from "./language-switcher";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathname.mockReturnValue("/home");
  });

  it("affiche la langue courante (français)", () => {
    renderWithIntl(<LanguageSwitcher />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Français");
  });

  it("basculer vers English appelle le router avec le nouveau locale sur le même chemin", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "English" }));

    expect(replace).toHaveBeenCalledWith("/home", { locale: "en" });
  });
});
