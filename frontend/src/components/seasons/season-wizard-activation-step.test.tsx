import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonWizardActivationStep } from "./season-wizard-activation-step";

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

function renderStep(onActivated = jest.fn()) {
  return {
    onActivated,
    ...renderWithIntl(
      <SeasonWizardActivationStep
        clubId="1"
        teamId="5"
        seasonId={100}
        onActivated={onActivated}
      />,
    ),
  };
}

const summaryWithOldSeason = {
  retained: [{ playerId: 1, firstName: "Marc", lastName: "Dupont" }],
  departing: [{ playerId: 2, firstName: "Alice", lastName: "Martin" }],
  arriving: [{ playerId: 3, firstName: "Paul", lastName: "Durand" }],
  oldSeasonEndDate: "2026-06-30",
};

const summaryFirstSeason = {
  retained: [],
  departing: [],
  arriving: [{ playerId: 3, firstName: "Paul", lastName: "Durand" }],
  oldSeasonEndDate: null,
};

describe("SeasonWizardActivationStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge et affiche le résumé reconduits/partants/arrivants", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(summaryWithOldSeason));

    renderStep();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/seasons/100/activation-summary",
        expect.anything(),
      );
    });
    expect(await screen.findByText("Marc Dupont")).toBeInTheDocument();
    expect(screen.getByText("Alice Martin")).toBeInTheDocument();
    expect(screen.getByText("Paul Durand")).toBeInTheDocument();
    expect(screen.getByText("Reconduits (1)")).toBeInTheDocument();
    expect(screen.getByText("Partants (1)")).toBeInTheDocument();
    expect(screen.getByText("Arrivants (1)")).toBeInTheDocument();
  });

  it("pré-remplit la date de fin de l'ancienne saison", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(summaryWithOldSeason));

    renderStep();

    expect(await screen.findByLabelText("Date de fin de l'ancienne saison")).toHaveValue(
      "2026-06-30",
    );
  });

  it("affiche un message simplifié et masque le champ de date pour une première saison", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(summaryFirstSeason));

    renderStep();

    expect(
      await screen.findByText(
        "Première saison de l'équipe : aucune saison précédente à archiver.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Date de fin de l'ancienne saison"),
    ).not.toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderStep();

    expect(
      await screen.findByText("Impossible de charger le résumé d'activation"),
    ).toBeInTheDocument();
  });

  it("active la saison et appelle onActivated", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(summaryWithOldSeason))
      .mockResolvedValueOnce(jsonResponse({ id: 100, status: "ACTIVE" }));
    const { onActivated } = renderStep();

    await screen.findByText("Marc Dupont");
    await user.click(screen.getByRole("button", { name: "Activer la saison" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100/activate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ oldSeasonEndDate: "2026-06-30" }),
        }),
      );
    });
    expect(onActivated).toHaveBeenCalled();
  });

  it("n'envoie pas oldSeasonEndDate pour une première saison", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(summaryFirstSeason))
      .mockResolvedValueOnce(jsonResponse({ id: 100, status: "ACTIVE" }));
    renderStep();

    await screen.findByText("Paul Durand");
    await user.click(screen.getByRole("button", { name: "Activer la saison" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100/activate",
        expect.objectContaining({ body: JSON.stringify({}) }),
      );
    });
  });

  it("n'appelle pas onActivated si l'activation échoue", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(summaryWithOldSeason))
      .mockResolvedValueOnce(
        jsonResponse({ code: "SEASONS.MULTIPLE_ACTIVE_SEASONS" }, false),
      );
    const { onActivated } = renderStep();

    await screen.findByText("Marc Dupont");
    await user.click(screen.getByRole("button", { name: "Activer la saison" }));

    await screen.findByRole("button", { name: "Activer la saison" });
    expect(onActivated).not.toHaveBeenCalled();
  });
});
