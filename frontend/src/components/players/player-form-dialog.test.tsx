import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingPlayer, PlayerFormDialog } from "./player-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

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

describe("PlayerFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : enchaîne POST membre → POST profil → POST affectation d'équipe", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ id: 42 })) // POST member
      .mockResolvedValueOnce(jsonResponse({ id: 100 })) // POST player profile
      .mockResolvedValueOnce(jsonResponse({ id: 200 })); // POST player-team
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
    await screen.findByText("Ajouter un joueur", { selector: "[data-slot=dialog-title]" });
    // La modale s'ouvre par défaut sur "Joueur existant du club" (recherche
    // privilégiée, retour utilisateur) — bascule explicitement sur "Nouveau
    // joueur" pour ce scénario de création classique.
    await user.click(screen.getByRole("button", { name: "Nouveau joueur" }));

    await user.type(screen.getByLabelText("Prénom"), "Nouveau");
    await user.type(screen.getByLabelText("Nom"), "Joueur");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/clubs/1/members?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          firstName: "Nouveau",
          lastName: "Joueur",
          phone: undefined,
          gender: undefined,
          birthDate: undefined,
        }),
      }),
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/players?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          memberId: 42,
          licenseNumber: undefined,
          nationality: undefined,
          preferredFoot: undefined,
        }),
      }),
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      3,
      "/clubs/1/teams/5/players",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          playerId: 100,
          jerseyNumber: undefined,
          mainPosition: undefined,
          secondaryPositions: [],
          joinDate: undefined,
        }),
      }),
    );
  });

  it("le prénom et le nom sont requis", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Nouveau joueur" }));
    await screen.findByLabelText("Prénom");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("mode édition : pré-remplit le formulaire et enchaîne les 3 PATCH", async () => {
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
    // teamId en query sur les deux premiers appels : régression du bug
    // Coach/403 (voir docs/modules/auth-roles.md §"Patterns découverts").
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/clubs/1/members/6?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    // birthDate est envoyé au membre (docs/schema/fondations.md, 2026-07-08),
    // plus au profil joueur.
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

  describe("mode « Joueur existant du club » (A18 — promotion U15→U16 entre saisons)", () => {
    it("recherche, sélectionne un candidat, puis POST uniquement l'affectation d'équipe (pas de Member/PlayerProfile créés)", async () => {
      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes("/clubs/1/players?search=")) {
          return Promise.resolve(
            jsonResponse([
              {
                id: 55,
                member: { firstName: "Alice", lastName: "Promue" },
                playerTeams: [{ team: { name: "U15" } }],
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse({ id: 300 }));
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
      // La modale s'ouvre par défaut sur "Joueur existant du club" (recherche
      // privilégiée, retour utilisateur) — pas de bascule à faire ici.
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Alice",
      );

      const result = await screen.findByRole("button", { name: /Alice Promue/ });
      expect(result).toHaveTextContent("Actuellement dans U15");
      await user.click(result);

      // Le candidat sélectionné remplace la recherche par une confirmation ;
      // les champs d'identité (Prénom/Nom/...) restent masqués.
      expect(screen.getByText("Actuellement dans U15")).toBeInTheDocument();
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Ajouter" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      // Un seul appel réseau côté écriture (en plus de la recherche) : aucun
      // POST vers /members ni /players (profil), contrairement au mode
      // "Nouveau joueur".
      const writeCalls = mockApiFetch.mock.calls.filter(
        ([, options]) => (options as RequestInit | undefined)?.method === "POST",
      );
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0][0]).toBe("/clubs/1/teams/8/players");
      expect(JSON.parse((writeCalls[0][1] as RequestInit).body as string)).toMatchObject({
        playerId: 55,
      });
    });

    it("affiche « Actuellement sans équipe » pour un candidat sans affectation active", async () => {
      mockApiFetch.mockResolvedValue(
        jsonResponse([
          { id: 60, member: { firstName: "Bob", lastName: "Libre" }, playerTeams: [] },
        ]),
      );
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
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Bob",
      );

      expect(
        await screen.findByText("Actuellement sans équipe"),
      ).toBeInTheDocument();
    });

    it("le bouton Changer revient à la recherche sans avoir soumis", async () => {
      mockApiFetch.mockResolvedValue(
        jsonResponse([
          {
            id: 55,
            member: { firstName: "Alice", lastName: "Promue" },
            playerTeams: [{ team: { name: "U15" } }],
          },
        ]),
      );
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
      await user.type(
        await screen.findByLabelText("Rechercher un joueur du club"),
        "Alice",
      );
      await user.click(await screen.findByRole("button", { name: /Alice Promue/ }));

      await user.click(screen.getByRole("button", { name: "Changer" }));

      expect(screen.getByLabelText("Rechercher un joueur du club")).toBeInTheDocument();
      expect(screen.queryByText("Actuellement dans U15")).not.toBeInTheDocument();
    });

    it("s'ouvre par défaut sur la recherche (pas les champs d'identité) ; basculer sur « Nouveau joueur » les réaffiche, puis retour possible", async () => {
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
      expect(await screen.findByLabelText("Rechercher un joueur du club")).toBeInTheDocument();
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Nouveau joueur" }));
      expect(screen.getByLabelText("Prénom")).toBeInTheDocument();
      expect(screen.queryByLabelText("Rechercher un joueur du club")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Joueur existant du club" }));
      expect(screen.getByLabelText("Rechercher un joueur du club")).toBeInTheDocument();
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();
    });
  });
});
