import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
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
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest.fn(),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

// L'onglet Mesures (rendu par défaut sur la fiche joueur) fait son propre
// appel `GET .../measurements` en plus du `GET` du profil joueur — router
// par URL plutôt que d'enchaîner des mockResolvedValueOnce positionnels.
function mockApiFetchDefault(playerBody: unknown, playerOk = true) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("/measurements")) return Promise.resolve(jsonResponse([]));
    if (url.includes("/absences")) return Promise.resolve(jsonResponse([]));
    if (url.includes("/seasons")) return Promise.resolve(jsonResponse({ data: [] }));
    return Promise.resolve(jsonResponse(playerBody, playerOk));
  });
}

function playerDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    licenseNumber: "1939034",
    nationality: "Suisse",
    preferredFoot: "RIGHT",
    member: {
      id: 6,
      firstName: "Tom",
      lastName: "Joueur",
      phone: "+41 78 252 81 83",
      gender: "MALE",
      birthDate: "2011-10-30",
      isActive: true,
      user: { id: 501, email: "tom@footmanager.test" },
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
    mockApiFetchDefault(playerDetail());

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
    mockApiFetchDefault(playerDetail());

    renderPage();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByText("tom@footmanager.test")).toBeInTheDocument();
    expect(screen.getByText("+41 78 252 81 83")).toBeInTheDocument();
    expect(screen.getByText("Homme")).toBeInTheDocument();
    expect(screen.getByText("1939034")).toBeInTheDocument();
    expect(screen.getByText("Droit")).toBeInTheDocument();
    // JJ/MM/AAAA : format d'affichage unique du projet (lib/date-format.ts),
    // jamais la chaîne ISO brute renvoyée par l'API.
    expect(screen.getByText("05/09/2025")).toBeInTheDocument();
    expect(screen.getByText("30/10/2011")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
    expect(screen.getByText("Milieu offensif")).toBeInTheDocument();
    expect(screen.getByText("Milieu défensif")).toBeInTheDocument();
  });

  it("affiche un tiret pour l'email d'un membre sans compte plutôt que de planter", async () => {
    mockApiFetchDefault(
      playerDetail({ member: { ...playerDetail().member, user: null } }),
    );

    renderPage();

    await screen.findByText("Tom Joueur");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("affiche les 7 onglets de la fiche joueur ; Mesures est actif par défaut, Dashboard/Blessure restent \"bientôt disponible\"", async () => {
    mockApiFetchDefault(playerDetail());
    const user = userEvent.setup();

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
    // Mesures (A7.1) est le seul onglet fonctionnel à ce stade — actif par défaut.
    expect(screen.getByText("Filtres")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(
      screen.getByText("Cette section arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });

  it("filtrage par saison (A12) : sélectionne la saison ACTIVE par défaut et la propage à l'onglet Objectifs", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/measurements")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/absences")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/seasons")) {
        return Promise.resolve(
          jsonResponse({ data: [{ id: 10, name: "Saison 2026-2027", status: "ACTIVE" }] }),
        );
      }
      if (url.includes("/objectives")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse(playerDetail()));
    });
    const user = userEvent.setup();

    renderPage("1", "5", "1");
    await screen.findByText("Tom Joueur");
    await screen.findByText("Saison 2026-2027");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("tab", { name: "Objectifs" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/objectives\?.*seasonId=10/),
        expect.anything(),
      ),
    );
  });

  it("l'onglet Absence (B8) affiche AbsenceTab, plus le placeholder \"bientôt disponible\"", async () => {
    mockApiFetchDefault(playerDetail());
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Tom Joueur");

    await user.click(screen.getByRole("tab", { name: "Absence" }));

    expect(await screen.findByRole("button", { name: "Ajouter une absence" })).toBeInTheDocument();
    expect(
      screen.queryByText("Cette section arrivera dans une prochaine phase."),
    ).not.toBeInTheDocument();
  });

  it("un joueur consultant sa propre fiche peut déclarer une absence sans champ Excusé, sans pouvoir en modifier/supprimer", async () => {
    mockApiFetchDefault(playerDetail(), true);
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/absences")) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 1,
              reason: "INJURY",
              description: null,
              startDate: "2026-07-10T00:00:00.000Z",
              endDate: "2026-07-20T00:00:00.000Z",
              isExcused: null,
              reportedBy: null,
            },
          ]),
        );
      }
      if (url.includes("/measurements")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/seasons")) return Promise.resolve(jsonResponse({ data: [] }));
      return Promise.resolve(jsonResponse(playerDetail()));
    });
    // player.member.user.id (501, voir playerDetail()) === l'utilisateur
    // connecté : Tom consulte sa propre fiche joueur.
    mockUseAuth.mockReturnValue({ accessToken: "token", user: { id: 501 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText("Tom Joueur");
    // Bouton d'édition du profil joueur (haut de page) : Player n'a que
    // READ/OWN sur player_profile, jamais UPDATE — masqué comme le reste.
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Absence" }));
    // "Blessure" est aussi le libellé (français) de l'onglet Injury,
    // toujours présent dans la barre d'onglets — cible le <p> du motif.
    await screen.findByText("Blessure", { selector: "p" });
    const panel = screen.getByRole("tabpanel");

    expect(within(panel).queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Ajouter une absence" }));
    expect(screen.queryByRole("combobox", { name: "Excusée" })).not.toBeInTheDocument();
  });

  it("affiche un message d'erreur visible si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(
      await screen.findByText("Impossible de charger le profil du joueur"),
    ).toBeInTheDocument();
  });

  it("affiche le bouton Modifier une fois le joueur chargé", async () => {
    mockApiFetchDefault(playerDetail());

    renderPage();

    expect(await screen.findByRole("button", { name: "Modifier" })).toBeInTheDocument();
  });

  it("cliquer un poste sur le terrain sauvegarde immédiatement (PATCH), sans bouton Enregistrer", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/measurements")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/seasons")) return Promise.resolve(jsonResponse({ data: [] }));
      if (options?.method === "PATCH") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse(playerDetail()));
    });
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
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/measurements")) return Promise.resolve(jsonResponse([]));
      if (url.includes("/seasons")) return Promise.resolve(jsonResponse({ data: [] }));
      if (options?.method === "PATCH") return Promise.resolve(jsonResponse(null, false));
      return Promise.resolve(jsonResponse(playerDetail()));
    });
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
