import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonWizardRosterStep } from "./season-wizard-roster-step";

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

const candidates = [
  { playerId: 1, firstName: "Marc", lastName: "Dupont", jerseyNumber: 9, mainPosition: "ST" },
  { playerId: 2, firstName: "Alice", lastName: "Martin", jerseyNumber: null, mainPosition: null },
];

function renderStep(onImported = jest.fn()) {
  return {
    onImported,
    ...renderWithIntl(
      <SeasonWizardRosterStep
        clubId="1"
        teamId="5"
        seasonId={100}
        onImported={onImported}
      />,
    ),
  };
}

describe("SeasonWizardRosterStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge le roster actif et coche tous les joueurs par défaut", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(candidates));

    renderStep();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/seasons/100/roster-import-preview",
        expect.anything(),
      );
    });
    expect(await screen.findByText("Marc Dupont")).toBeInTheDocument();
    expect(screen.getByLabelText("Marc Dupont")).toBeChecked();
    expect(screen.getByLabelText("Alice Martin")).toBeChecked();
  });

  it("affiche un message si aucun joueur actif", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderStep();

    expect(
      await screen.findByText("Aucun joueur actif à reconduire."),
    ).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderStep();

    expect(
      await screen.findByText("Impossible de charger le roster actuel"),
    ).toBeInTheDocument();
  });

  it("décoche un joueur puis confirme : ne transmet que les joueurs reconduits", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(candidates)) // preview
      .mockResolvedValueOnce(jsonResponse({ importedCount: 1 })); // POST import
    const { onImported } = renderStep();

    await screen.findByText("Marc Dupont");
    await user.click(screen.getByLabelText("Alice Martin"));
    await user.click(screen.getByRole("button", { name: "Confirmer le roster et continuer" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100/roster-import",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ retainedPlayerIds: [1] }),
        }),
      );
    });
    expect(onImported).toHaveBeenCalledWith(1);
  });

  it("confirme sans décocher : transmet tous les joueurs actifs", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(candidates))
      .mockResolvedValueOnce(jsonResponse({ importedCount: 2 }));
    const { onImported } = renderStep();

    await screen.findByText("Marc Dupont");
    await user.click(screen.getByRole("button", { name: "Confirmer le roster et continuer" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100/roster-import",
        expect.objectContaining({
          body: JSON.stringify({ retainedPlayerIds: [1, 2] }),
        }),
      );
    });
    expect(onImported).toHaveBeenCalledWith(2);
  });

  it("n'appelle pas onImported si l'import échoue", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(candidates))
      .mockResolvedValueOnce(jsonResponse({ code: "SEASONS.ROSTER_IMPORT_ONLY_FOR_DRAFT" }, false));
    const { onImported } = renderStep();

    await screen.findByText("Marc Dupont");
    await user.click(screen.getByRole("button", { name: "Confirmer le roster et continuer" }));

    await screen.findByRole("button", { name: "Confirmer le roster et continuer" });
    expect(onImported).not.toHaveBeenCalled();
  });
});
