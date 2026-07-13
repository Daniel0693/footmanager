import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonWizardResumePageContent } from "./page";

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

function renderPage(seasonId = "10") {
  return renderWithIntl(
    <SeasonWizardResumePageContent clubId="1" teamId="5" seasonId={seasonId} />,
  );
}

describe("SeasonWizardResumePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge la saison à reprendre puis affiche le wizard à l'étape 2", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({
        id: 10,
        name: "Saison 2026-2027",
        startDate: "2026-08-01",
        endDate: "2027-06-30",
      }),
    );

    renderPage("10");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/seasons/10",
        expect.anything(),
      );
    });
    expect(
      await screen.findByText("Cette étape sera disponible prochainement."),
    ).toBeInTheDocument();
  });

  it("affiche un message d'erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(
      await screen.findByText("Impossible de charger les saisons"),
    ).toBeInTheDocument();
  });
});
