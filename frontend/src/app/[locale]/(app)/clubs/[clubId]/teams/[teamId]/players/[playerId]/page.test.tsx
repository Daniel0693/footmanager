import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { PlayerDetailPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  parseErrorCode: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function playerDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    licenseNumber: "1939034",
    nationality: "Suisse",
    birthDate: "2011-10-30",
    preferredFoot: "RIGHT",
    member: {
      id: 6,
      firstName: "Tom",
      lastName: "Joueur",
      phone: "+41 78 252 81 83",
      gender: "MALE",
      isActive: true,
      user: { email: "tom@footmanager.test" },
    },
    playerTeams: [
      {
        id: 1,
        teamId: 5,
        jerseyNumber: 8,
        mainPosition: "CAM",
        secondaryPositions: ["CDM", "CM"],
        joinDate: "2025-09-05",
      },
    ],
    ...overrides,
  };
}

function renderPage(clubId = "1", teamId = "5", playerId = "1") {
  return renderWithIntl(
    <PlayerDetailPageContent clubId={clubId} teamId={teamId} playerId={playerId} />,
  );
}

describe("PlayerDetailPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("appelle le bon endpoint avec teamId en query — régression du bug Coach/403 sur la fiche joueur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(playerDetail()));

    renderPage("1", "5", "1");

    await screen.findByText("Tom Joueur");
    // teamId en query : /clubs/:clubId/players/:id ne porte pas de teamId
    // dans son URL naturelle, donc un Coach (scope TEAM sur
    // `player_profile READ`) recevait un 403 sans lui (bug signalé en test
    // manuel avec le compte Entraîneur — voir docs/modules/auth-roles.md).
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/1?teamId=5",
      expect.anything(),
    );
  });

  it("affiche l'identité, les informations sportives et les positions", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(playerDetail()));

    renderPage();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByText("tom@footmanager.test")).toBeInTheDocument();
    expect(screen.getByText("+41 78 252 81 83")).toBeInTheDocument();
    expect(screen.getByText("Homme")).toBeInTheDocument();
    expect(screen.getByText("1939034")).toBeInTheDocument();
    expect(screen.getByText("Droit")).toBeInTheDocument();
    expect(screen.getByText("2025-09-05")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Milieu offensif")).toBeInTheDocument();
    expect(screen.getByText("Milieu défensif")).toBeInTheDocument();
  });

  it("affiche un tiret pour l'email d'un membre sans compte plutôt que de planter", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse(playerDetail({ member: { ...playerDetail().member, user: null } })),
    );

    renderPage();

    await screen.findByText("Tom Joueur");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("affiche les 7 onglets de la fiche joueur, tous en \"bientôt disponible\"", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(playerDetail()));

    renderPage();
    await screen.findByText("Tom Joueur");

    for (const label of [
      "Dashboard",
      "Mesures",
      "Évaluation",
      "Objectifs",
      "Entretien",
      "Absence",
      "Blessure",
    ]) {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByText("Cette section arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(
      await screen.findByText("Impossible de charger le profil du joueur"),
    ).toBeInTheDocument();
  });

  it("affiche le bouton Modifier une fois le joueur chargé", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(playerDetail()));

    renderPage();

    expect(await screen.findByRole("button", { name: "Modifier" })).toBeInTheDocument();
  });

  it("cliquer un poste sur le terrain sauvegarde immédiatement (PATCH), sans bouton Enregistrer", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(playerDetail())) // GET initial
      .mockResolvedValueOnce(jsonResponse({})); // PATCH
    const user = userEvent.setup();

    renderPage("1", "5", "1");
    await screen.findByText("Tom Joueur");

    await user.click(screen.getByRole("button", { name: "Buteur" })); // ST, pas encore sélectionné

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        "/clubs/1/teams/5/players/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ mainPosition: "ST" }),
        }),
      ),
    );
    // mise à jour optimiste immédiate, sans attendre de bouton "Enregistrer"
    expect(screen.getByText("Buteur")).toBeInTheDocument();
  });

  it("échec du PATCH de poste : la sélection est restaurée et une erreur est affichée", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(playerDetail()))
      .mockResolvedValueOnce(jsonResponse(null, false));
    const user = userEvent.setup();

    renderPage("1", "5", "1");
    await screen.findByText("Tom Joueur");

    await user.click(screen.getByRole("button", { name: "Buteur" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // revert optimiste : "Buteur" disparaît, le poste principal d'origine revient
    expect(screen.queryByText("Buteur")).not.toBeInTheDocument();
    expect(screen.getByText("Milieu offensif")).toBeInTheDocument();
  });
});
