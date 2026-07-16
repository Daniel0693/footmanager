import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingPlayer, PlayerFormDialog, PlayerMatchResult } from "./player-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
const mockParseErrorCode = jest.fn().mockResolvedValue("AUTH.UNKNOWN");
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: (...args: unknown[]) => mockParseErrorCode(...args),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

// Même calcul que todayIsoDate() dans le composant (date locale, pas UTC).
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const newMatch: PlayerMatchResult = { status: "NEW", candidates: [] };

const existingPlayer: ExistingPlayer = {
  memberId: 6,
  playerId: 1,
  playerTeamId: 9,
  firstName: "Tom",
  lastName: "Joueur",
  phone: "+41 78 000 00 00",
  gender: "MALE",
  licenseNumber: "1939034",
  nationality: "Suisse",
  birthDate: "2011-10-30",
  preferredFoot: "RIGHT",
  jerseyNumber: 8,
  mainPosition: "CAM",
  secondaryPositions: [],
  joinDate: "2025-09-05",
};

// Routeur de mock générique par URL — nécessaire depuis l'introduction du
// rapprochement automatique (GET .../roster/lookup, déclenché dès que
// prénom+nom sont saisis) : l'ordre des appels réseau n'est plus une simple
// séquence linéaire comme avant (recherche débouncée en parallèle des POST).
function mockRoutes(routes: {
  lookup?: PlayerMatchResult;
  search?: unknown[];
  member?: { id: number };
  profile?: { id: number };
  team?: { id: number };
}) {
  mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes("/roster/lookup")) {
      return Promise.resolve(jsonResponse(routes.lookup ?? newMatch));
    }
    if (url.includes("/players?search=")) {
      return Promise.resolve(jsonResponse(routes.search ?? []));
    }
    if (url.includes("/members?teamId=") && options?.method === "POST") {
      return Promise.resolve(jsonResponse(routes.member ?? { id: 42 }));
    }
    if (url.includes("/players?teamId=") && options?.method === "POST") {
      return Promise.resolve(jsonResponse(routes.profile ?? { id: 100 }));
    }
    if (url.includes("/teams/") && url.includes("/players") && options?.method === "POST") {
      return Promise.resolve(jsonResponse(routes.team ?? { id: 200 }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

describe("PlayerFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : détection Nouveau, enchaîne POST membre → POST profil → POST affectation d'équipe", async () => {
    mockRoutes({ lookup: newMatch, member: { id: 42 }, profile: { id: 100 }, team: { id: 200 } });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un joueur</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
    await user.type(await screen.findByLabelText("Prénom"), "Nouveau");
    await user.type(screen.getByLabelText("Nom"), "Joueur");
    // Prénom+nom seuls ne suffisent pas à déclencher la recherche (retour
    // utilisateur du 2026-07-16) : il faut aussi une date de naissance ou
    // une licence.
    await user.type(screen.getByLabelText("Date de naissance"), "2015-01-01");

    // Aucune correspondance : carte dédiée avec choix explicite avant de
    // révéler le reste du formulaire (retour utilisateur du 2026-07-16).
    await screen.findByText("Aucune correspondance trouvée pour Nouveau Joueur");
    expect(screen.queryByLabelText("Téléphone")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Créer un nouveau joueur" }));

    const submitButton = await screen.findByRole("button", { name: "Ajouter" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    expect(screen.getByLabelText("Téléphone")).toBeInTheDocument();

    await user.click(submitButton);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const memberCall = mockApiFetch.mock.calls.find(([url]) =>
      (url as string).includes("/clubs/1/members?teamId=5"),
    );
    expect(memberCall).toBeDefined();
    expect(JSON.parse((memberCall![1] as RequestInit).body as string)).toMatchObject({
      firstName: "Nouveau",
      lastName: "Joueur",
    });

    const profileCall = mockApiFetch.mock.calls.find(([url]) =>
      (url as string).includes("/clubs/1/players?teamId=5"),
    );
    expect(JSON.parse((profileCall![1] as RequestInit).body as string)).toMatchObject({
      memberId: 42,
    });

    const teamCall = mockApiFetch.mock.calls.find(
      ([url, options]) =>
        (url as string) === "/clubs/1/teams/5/players" &&
        (options as RequestInit)?.method === "POST",
    );
    expect(JSON.parse((teamCall![1] as RequestInit).body as string)).toMatchObject({
      playerId: 100,
    });
  });

  it("numéro de maillot déjà pris : encadre le champ en rouge avec un message dédié, en plus du toast (retour utilisateur)", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/roster/lookup")) {
        return Promise.resolve(jsonResponse(newMatch));
      }
      if (url.includes("/members?teamId=") && options?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: 42 }));
      }
      if (url.includes("/players?teamId=") && options?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: 100 }));
      }
      if (url.includes("/teams/") && url.includes("/players") && options?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ code: "PLAYER_TEAMS.JERSEY_NUMBER_TAKEN" }, false),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    // mockResolvedValueOnce (pas mockResolvedValue) : ne consomme qu'un seul
    // appel, pour ne pas polluer le comportement par défaut ("AUTH.UNKNOWN")
    // des autres tests — jest.clearAllMocks() (beforeEach) ne réinitialise
    // que l'historique des appels, jamais les implémentations mockées.
    mockParseErrorCode.mockResolvedValueOnce("PLAYER_TEAMS.JERSEY_NUMBER_TAKEN");
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un joueur</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
    await user.type(await screen.findByLabelText("Prénom"), "Nouveau");
    await user.type(screen.getByLabelText("Nom"), "Joueur");
    await user.type(screen.getByLabelText("Date de naissance"), "2015-01-01");
    await user.click(
      await screen.findByRole("button", { name: "Créer un nouveau joueur" }),
    );
    await user.type(await screen.findByLabelText("Numéro de maillot"), "3");

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(await screen.findByText("Numéro déjà pris dans cette équipe")).toBeInTheDocument();
    expect(screen.getByLabelText("Numéro de maillot")).toHaveAttribute("aria-invalid", "true");
  });

  it("le prénom et le nom sont requis (aucun appel réseau tant qu'ils sont vides)", async () => {
    mockRoutes({});
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un joueur</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
    await screen.findByLabelText("Prénom");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("la date d'arrivée dans l'équipe est préremplie à aujourd'hui en création, modifiable au besoin", async () => {
    mockRoutes({ lookup: newMatch });
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un joueur</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
    await user.type(await screen.findByLabelText("Prénom"), "Nouveau");
    await user.type(screen.getByLabelText("Nom"), "Joueur");
    await user.type(screen.getByLabelText("Date de naissance"), "2015-01-01");
    await user.click(
      await screen.findByRole("button", { name: "Créer un nouveau joueur" }),
    );

    const joinDateInput = await screen.findByLabelText<HTMLInputElement>(
      "Date d'arrivée dans l'équipe",
    );
    expect(joinDateInput).toHaveValue(todayIsoDate());

    // Toujours modifiable (anticipation ou retard de saisie).
    await user.clear(joinDateInput);
    await user.type(joinDateInput, "2026-09-01");
    expect(joinDateInput).toHaveValue("2026-09-01");
  });

  it("mode édition : ne remplace pas une date d'arrivée vide par aujourd'hui", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        player={{ ...existingPlayer, joinDate: null }}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const joinDateInput = await screen.findByLabelText<HTMLInputElement>(
      "Date d'arrivée dans l'équipe",
    );
    expect(joinDateInput).toHaveValue("");
  });

  it("mode édition : pré-remplit le formulaire et enchaîne les 3 PATCH (rapprochement non déclenché)", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ id: 6 }))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))
      .mockResolvedValueOnce(jsonResponse({ id: 9 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        player={existingPlayer}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const firstNameInput = await screen.findByLabelText<HTMLInputElement>("Prénom");
    expect(firstNameInput).toHaveValue("Tom");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    // Aucun appel de rapprochement en mode édition (seulement les 3 PATCH).
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/clubs/1/members/6?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, memberOptions] = mockApiFetch.mock.calls[0];
    expect(JSON.parse((memberOptions as RequestInit).body as string)).toMatchObject({
      birthDate: "2011-10-30",
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/players/1?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, profileOptions] = mockApiFetch.mock.calls[1];
    expect(JSON.parse((profileOptions as RequestInit).body as string)).not.toHaveProperty(
      "birthDate",
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      3,
      "/clubs/1/teams/5/players/9",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("pré-remplit date de naissance et date d'arrivée même quand l'API renvoie une date ISO complète (régression 2026-07-10)", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <PlayerFormDialog
        clubId="1"
        teamId="5"
        player={{
          ...existingPlayer,
          birthDate: "2011-10-30T00:00:00.000Z",
          joinDate: "2025-09-05T00:00:00.000Z",
        }}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(await screen.findByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue(
      "2011-10-30",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Date d'arrivée dans l'équipe")).toHaveValue(
      "2025-09-05",
    );
  });

  describe("mode contrôlé (open/onOpenChange externes, sans trigger visible)", () => {
    it("s'ouvre déjà pré-rempli quand open=true est transmis dès le premier rendu (colonne Actions, B5.3)", async () => {
      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="5"
          player={existingPlayer}
          open={true}
          onOpenChange={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );

      const firstNameInput = await screen.findByLabelText<HTMLInputElement>("Prénom");
      expect(firstNameInput).toHaveValue("Tom");
      // Aucun trigger fourni (mode contrôlé) : la modale s'ouvre directement,
      // sans bouton "Modifier"/"Ajouter" distinct du bouton "Enregistrer".
      expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ajouter un joueur" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
    });

    it("appelle onOpenChange(false) après une sauvegarde réussie, plutôt que de gérer un état interne", async () => {
      mockApiFetch
        .mockResolvedValueOnce(jsonResponse({ id: 6 }))
        .mockResolvedValueOnce(jsonResponse({ id: 1 }))
        .mockResolvedValueOnce(jsonResponse({ id: 9 }));
      const onOpenChange = jest.fn();
      const onSuccess = jest.fn();
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="5"
          player={existingPlayer}
          open={true}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Enregistrer" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("se met à jour si le parent change la ligne éditée (nouveau memberId) pendant que open reste true", async () => {
      const { rerender } = renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="5"
          player={existingPlayer}
          open={true}
          onOpenChange={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );
      expect(await screen.findByLabelText<HTMLInputElement>("Prénom")).toHaveValue("Tom");

      rerender(
        <PlayerFormDialog
          clubId="1"
          teamId="5"
          player={{ ...existingPlayer, firstName: "Autre" }}
          open={true}
          onOpenChange={jest.fn()}
          onSuccess={jest.fn()}
        />,
      );

      expect(await screen.findByLabelText<HTMLInputElement>("Prénom")).toHaveValue("Autre");
    });
  });

  describe("rapprochement automatique (docs/decisions-ouvertes-et-rgpd.md, 2026-07-16)", () => {
    it("un texte explique dès l'ouverture que la date de naissance/licence déclenche une vérification automatique, puis disparaît une fois la recherche tentée", async () => {
      mockRoutes({ lookup: newMatch });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await screen.findByLabelText("Prénom");
      // Visible dès l'ouverture, avant même toute saisie (retour utilisateur
      // du 2026-07-16 : rien n'indiquait que remplir la date de naissance
      // faisait quoi que ce soit).
      expect(
        screen.getByText(
          "Si vous connaissez la date de naissance ou le numéro de licence, nous vérifions automatiquement si ce joueur existe déjà dans le club.",
        ),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText("Prénom"), "Nouveau");
      await user.type(screen.getByLabelText("Nom"), "Joueur");
      await user.type(screen.getByLabelText("Date de naissance"), "2015-01-01");

      // Une fois la recherche tentée, le panneau de résultat prend le relais.
      await screen.findByText("Aucune correspondance trouvée pour Nouveau Joueur");
      expect(
        screen.queryByText(
          "Si vous connaissez la date de naissance ou le numéro de licence, nous vérifions automatiquement si ce joueur existe déjà dans le club.",
        ),
      ).not.toBeInTheDocument();
    });

    it("prénom+nom seuls ne déclenchent aucune recherche et masquent le reste du formulaire (bug signalé : Nina David)", async () => {
      mockRoutes({});
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Nina");
      await user.type(screen.getByLabelText("Nom"), "David");

      // Ni date de naissance ni licence : aucun appel réseau, le reste du
      // formulaire reste masqué, la validation est bloquée.
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Téléphone")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
      // La recherche manuelle reste accessible même sans date de naissance
      // ni licence connues (retour utilisateur du 2026-07-16) : dès que
      // prénom+nom sont renseignés, quel que soit l'état de la recherche
      // automatique.
      expect(
        screen.getByRole("button", { name: "Rechercher un joueur existant" }),
      ).toBeInTheDocument();
    });

    it("date de naissance seule (sans licence) suffit à déclencher la recherche ; « Aucune correspondance » propose de créer ou de rechercher à nouveau", async () => {
      mockRoutes({ lookup: newMatch });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Nina");
      await user.type(screen.getByLabelText("Nom"), "David");
      await user.type(screen.getByLabelText("Date de naissance"), "2011-04-19");

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          expect.stringContaining("/clubs/1/teams/8/roster/lookup"),
          expect.anything(),
        ),
      );
      await screen.findByText("Aucune correspondance trouvée pour Nina David");
      expect(screen.queryByLabelText("Téléphone")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Créer un nouveau joueur" }));

      expect(await screen.findByLabelText("Téléphone")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ajouter" })).not.toBeDisabled();
    });

    it("« Chercher à nouveau » vide le formulaire d'identité et attend une nouvelle recherche", async () => {
      mockRoutes({ lookup: newMatch });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Nina");
      await user.type(screen.getByLabelText("Nom"), "David");
      await user.type(screen.getByLabelText("Date de naissance"), "2011-04-19");

      await user.click(
        await screen.findByRole("button", { name: "Chercher à nouveau" }),
      );

      expect(screen.getByLabelText<HTMLInputElement>("Prénom")).toHaveValue("");
      expect(screen.getByLabelText<HTMLInputElement>("Nom")).toHaveValue("");
      expect(screen.getByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue("");
      expect(
        screen.queryByText("Aucune correspondance trouvée pour Nina David"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Téléphone")).not.toBeInTheDocument();
    });

    it("tant qu'une réactivation est proposée (sans décision), le reste du formulaire et la recherche manuelle restent masqués", async () => {
      mockRoutes({
        lookup: {
          status: "REACTIVATION",
          candidates: [
            {
              playerId: 4,
              firstName: "Malo",
              lastName: "Garnier",
              activeAssignmentInTeam: null,
              lastAssignment: { jerseyNumber: 4, mainPosition: "RWB", secondaryPositions: [] },
              activeTeamsElsewhere: [{ teamId: 3, teamName: "U15" }],
            },
          ],
        },
      });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Malo");
      await user.type(screen.getByLabelText("Nom"), "Garnier");
      await user.type(screen.getByLabelText("Date de naissance"), "2012-09-04");

      await screen.findByRole("button", { name: "Réactiver ce joueur" });
      expect(screen.queryByLabelText("Téléphone")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Genre")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Nationalité")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Numéro de maillot")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Date d'arrivée dans l'équipe")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Poste principal")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Rechercher un joueur existant" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
    });

    it("RÉACTIVATION (autre équipe du club) : confirme, POST uniquement l'affectation d'équipe", async () => {
      mockRoutes({
        lookup: {
          status: "REACTIVATION",
          candidates: [
            {
              playerId: 55,
              firstName: "Alice",
              lastName: "Promue",
              activeAssignmentInTeam: null,
              lastAssignment: null,
              activeTeamsElsewhere: [{ teamId: 3, teamName: "U15" }],
            },
          ],
        },
        team: { id: 300 },
      });
      const onSuccess = jest.fn();
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={onSuccess}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Alice");
      await user.type(screen.getByLabelText("Nom"), "Promue");
      await user.type(screen.getByLabelText("Date de naissance"), "2010-05-12");

      await user.click(await screen.findByRole("button", { name: "Réactiver ce joueur" }));

      // Le candidat confirmé remplace les champs d'identité par une carte.
      expect(screen.getByText("Actuellement dans U15")).toBeInTheDocument();
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ajouter" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      const writeCalls = mockApiFetch.mock.calls.filter(
        ([, options]) => (options as RequestInit | undefined)?.method === "POST",
      );
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0][0]).toBe("/clubs/1/teams/8/players");
      expect(JSON.parse((writeCalls[0][1] as RequestInit).body as string)).toMatchObject({
        playerId: 55,
      });
    });

    it("RÉACTIVATION : préremplit maillot et poste depuis la dernière affectation connue, même si elle vient d'une autre équipe (bug signalé : Nina David)", async () => {
      mockRoutes({
        lookup: {
          status: "REACTIVATION",
          candidates: [
            {
              playerId: 77,
              firstName: "Karim",
              lastName: "Ancien",
              activeAssignmentInTeam: null,
              lastAssignment: { jerseyNumber: 7, mainPosition: "CDM", secondaryPositions: [] },
              activeTeamsElsewhere: [],
            },
          ],
        },
        team: { id: 301 },
      });
      const onSuccess = jest.fn();
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={onSuccess}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Karim");
      await user.type(screen.getByLabelText("Nom"), "Ancien");
      await user.type(screen.getByLabelText("Date de naissance"), "2009-03-20");
      await user.click(await screen.findByRole("button", { name: "Réactiver ce joueur" }));

      await user.click(screen.getByRole("button", { name: "Ajouter" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      const teamCall = mockApiFetch.mock.calls.find(
        ([url, options]) =>
          (url as string) === "/clubs/1/teams/8/players" &&
          (options as RequestInit)?.method === "POST",
      );
      expect(JSON.parse((teamCall![1] as RequestInit).body as string)).toMatchObject({
        playerId: 77,
        jerseyNumber: 7,
        mainPosition: "CDM",
      });
    });

    it("refuser la réactivation proposée revient au formulaire de création classique", async () => {
      mockRoutes({
        lookup: {
          status: "REACTIVATION",
          candidates: [
            {
              playerId: 55,
              firstName: "Alice",
              lastName: "Promue",
              activeAssignmentInTeam: null,
              lastAssignment: null,
              activeTeamsElsewhere: [],
            },
          ],
        },
      });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Alice");
      await user.type(screen.getByLabelText("Nom"), "Promue");
      await user.type(screen.getByLabelText("Date de naissance"), "2010-05-12");
      await user.click(
        await screen.findByRole("button", { name: "Non, créer un nouveau joueur" }),
      );

      expect(
        screen.queryByRole("button", { name: "Réactiver ce joueur" }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("Prénom")).toBeInTheDocument();
    });

    it("AMBIGU : choisir un candidat dans la liste POST uniquement l'affectation d'équipe", async () => {
      mockRoutes({
        lookup: {
          status: "AMBIGUOUS",
          candidates: [
            {
              playerId: 10,
              firstName: "Marc",
              lastName: "Dupont",
              activeAssignmentInTeam: null,
              lastAssignment: null,
              activeTeamsElsewhere: [],
            },
            {
              playerId: 11,
              firstName: "Marc",
              lastName: "Dupont",
              activeAssignmentInTeam: null,
              lastAssignment: null,
              activeTeamsElsewhere: [{ teamId: 4, teamName: "U17" }],
            },
          ],
        },
        team: { id: 400 },
      });
      const onSuccess = jest.fn();
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={onSuccess}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Marc");
      await user.type(screen.getByLabelText("Nom"), "Dupont");
      await user.type(screen.getByLabelText("Date de naissance"), "2012-11-02");

      await screen.findByText("Plusieurs joueurs correspondent :");
      const candidates = screen.getAllByText("Marc Dupont");
      await user.click(candidates[1]);

      expect(screen.getByText("Actuellement dans U17")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ajouter" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      const teamCall = mockApiFetch.mock.calls.find(
        ([url, options]) =>
          (url as string) === "/clubs/1/teams/8/players" &&
          (options as RequestInit)?.method === "POST",
      );
      expect(JSON.parse((teamCall![1] as RequestInit).body as string)).toMatchObject({
        playerId: 11,
      });
    });

    it("MODIFICATION : joueur déjà dans cette équipe, bloque la validation", async () => {
      mockRoutes({
        lookup: {
          status: "MODIFICATION",
          candidates: [
            {
              playerId: 55,
              firstName: "Alice",
              lastName: "Déjà là",
              activeAssignmentInTeam: { jerseyNumber: 9, mainPosition: "ST", secondaryPositions: [] },
              lastAssignment: { jerseyNumber: 9, mainPosition: "ST", secondaryPositions: [] },
              activeTeamsElsewhere: [],
            },
          ],
        },
      });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Alice");
      await user.type(screen.getByLabelText("Nom"), "Déjà là");
      await user.type(screen.getByLabelText("Date de naissance"), "2010-05-12");

      await screen.findByText("Ce joueur est déjà dans cette équipe.");
      expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
    });
  });

  describe("recherche manuelle de secours (« Rechercher un joueur existant »)", () => {
    it("ouvre la recherche, sélectionne un candidat, puis POST uniquement l'affectation d'équipe", async () => {
      mockRoutes({
        search: [
          {
            id: 55,
            member: { firstName: "Alice", lastName: "Promue" },
            playerTeams: [{ team: { name: "U15" } }],
          },
        ],
        team: { id: 300 },
      });
      const onSuccess = jest.fn();
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={onSuccess}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      // Une recherche automatique est en cours (date de naissance fournie) :
      // le bouton de recherche manuelle reste masqué tant que la carte
      // "Aucune correspondance" n'a pas été résolue.
      await user.type(await screen.findByLabelText("Prénom"), "Quelqu'un");
      await user.type(screen.getByLabelText("Nom"), "Dautre");
      await user.type(screen.getByLabelText("Date de naissance"), "2010-01-01");
      // Aucune correspondance : il faut d'abord choisir "Créer un nouveau
      // joueur" pour que le lien de recherche manuelle apparaisse.
      await user.click(
        await screen.findByRole("button", { name: "Créer un nouveau joueur" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Rechercher un joueur existant" }),
      );
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Alice",
      );

      const result = await screen.findByRole("button", { name: /Alice Promue/ });
      expect(result).toHaveTextContent("Actuellement dans U15");
      await user.click(result);

      expect(screen.getByText("Actuellement dans U15")).toBeInTheDocument();
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ajouter" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      const writeCalls = mockApiFetch.mock.calls.filter(
        ([, options]) => (options as RequestInit | undefined)?.method === "POST",
      );
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0][0]).toBe("/clubs/1/teams/8/players");
      expect(JSON.parse((writeCalls[0][1] as RequestInit).body as string)).toMatchObject({
        playerId: 55,
      });
    });

    it("transmet teamId sur la recherche manuelle (régression : un Coach recevait 403 sans ce paramètre, GET .../players n'ayant pas de teamId dans son URL naturelle)", async () => {
      mockRoutes({ search: [] });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Quelqu'un");
      await user.type(screen.getByLabelText("Nom"), "Dautre");
      await user.click(
        await screen.findByRole("button", { name: "Rechercher un joueur existant" }),
      );
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Alice",
      );

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          expect.stringMatching(/\/clubs\/1\/players\?search=Alice&teamId=8/),
          expect.anything(),
        ),
      );
    });

    it("une erreur de recherche manuelle (ex. 403) affiche un message d'erreur, jamais silencieusement confondue avec « Aucun joueur trouvé » (bug signalé le 2026-07-16)", async () => {
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/players?search=")) {
          return Promise.resolve(jsonResponse({ code: "AUTH.FORBIDDEN" }, false));
        }
        return Promise.resolve(jsonResponse({}));
      });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Quelqu'un");
      await user.type(screen.getByLabelText("Nom"), "Dautre");
      await user.click(
        await screen.findByRole("button", { name: "Rechercher un joueur existant" }),
      );
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Alice",
      );

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.queryByText("Aucun joueur trouvé")).not.toBeInTheDocument();
    });

    it("« Revenir » referme la recherche manuelle sans avoir rien sélectionné", async () => {
      mockRoutes({ search: [] });
      const user = userEvent.setup();

      renderWithIntl(
        <PlayerFormDialog
          clubId="1"
          teamId="8"
          onSuccess={jest.fn()}
          trigger={<Button>Ajouter un joueur</Button>}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Ajouter un joueur" }));
      await user.type(await screen.findByLabelText("Prénom"), "Quelqu'un");
      await user.type(screen.getByLabelText("Nom"), "Dautre");
      await user.type(screen.getByLabelText("Date de naissance"), "2010-01-01");
      // Aucune correspondance : il faut d'abord choisir "Créer un nouveau
      // joueur" pour que le lien de recherche manuelle apparaisse.
      await user.click(
        await screen.findByRole("button", { name: "Créer un nouveau joueur" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Rechercher un joueur existant" }),
      );
      await screen.findByLabelText("Rechercher un joueur du club");

      await user.click(screen.getByRole("button", { name: "Revenir" }));

      expect(screen.getByLabelText("Prénom")).toBeInTheDocument();
      expect(screen.queryByLabelText("Rechercher un joueur du club")).not.toBeInTheDocument();
    });
  });
});
