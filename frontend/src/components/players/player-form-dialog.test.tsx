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
          birthDate: undefined,
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
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/players/1?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      3,
      "/clubs/1/teams/5/players/9",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
