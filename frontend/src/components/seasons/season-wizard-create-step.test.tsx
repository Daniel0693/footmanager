import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { SeasonWizardCreateStep } from "./season-wizard-create-step";

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

describe("SeasonWizardCreateStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("crée la saison et transmet la ressource créée à onCreated", async () => {
    const onCreated = jest.fn();
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(
      jsonResponse({
        id: 10,
        name: "Saison 2026-2027",
        startDate: "2026-08-01",
        endDate: "2027-06-30",
      }),
    );

    renderWithIntl(
      <SeasonWizardCreateStep clubId="1" teamId="5" onCreated={onCreated} />,
    );

    await user.type(screen.getByLabelText("Nom de la saison"), "Saison 2026-2027");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison et continuer" }));

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/seasons",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Saison 2026-2027",
          startDate: "2026-08-01",
          endDate: "2027-06-30",
        }),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith({
      id: 10,
      name: "Saison 2026-2027",
      startDate: "2026-08-01",
      endDate: "2027-06-30",
    });
  });

  it("affiche une erreur de validation si le nom est vide", async () => {
    const onCreated = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonWizardCreateStep clubId="1" teamId="5" onCreated={onCreated} />,
    );

    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison et continuer" }));

    expect(await screen.findByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("refuse une date de fin antérieure à la date de début, sans appeler l'API", async () => {
    const onCreated = jest.fn();
    const user = userEvent.setup();
    const { toast } = jest.requireMock("sonner") as { toast: { error: jest.Mock } };

    renderWithIntl(
      <SeasonWizardCreateStep clubId="1" teamId="5" onCreated={onCreated} />,
    );

    await user.type(screen.getByLabelText("Nom de la saison"), "Saison invalide");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Créer la saison et continuer" }));

    expect(toast.error).toHaveBeenCalledWith(
      "La date de fin doit être postérieure à la date de début",
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("affiche une erreur et n'appelle pas onCreated si l'API échoue", async () => {
    const onCreated = jest.fn();
    const user = userEvent.setup();
    const { toast } = jest.requireMock("sonner") as { toast: { error: jest.Mock } };
    mockApiFetch.mockResolvedValue(jsonResponse({ code: "SEASONS.TEAM_NOT_IN_CLUB" }, false));

    renderWithIntl(
      <SeasonWizardCreateStep clubId="1" teamId="5" onCreated={onCreated} />,
    );

    await user.type(screen.getByLabelText("Nom de la saison"), "Saison 2026-2027");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison et continuer" }));

    await screen.findByRole("button", { name: "Créer la saison et continuer" });
    expect(toast.error).toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
