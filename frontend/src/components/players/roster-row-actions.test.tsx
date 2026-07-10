import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { RosterRowActions, type RosterActionRow } from "./roster-row-actions";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest.fn().mockImplementation(async (response: { json: () => Promise<{ code?: string }> }) => {
    const body = await response.json().catch(() => null);
    return body?.code ?? "AUTH.UNKNOWN";
  }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const playerRow: RosterActionRow = {
  id: 200,
  memberId: 42,
  playerId: 100,
  role: "PLAYER",
  firstName: "Karim",
  lastName: "Benali",
  phone: null,
  birthDate: null,
};

const staffRow: RosterActionRow = {
  id: 900,
  memberId: 90,
  playerId: null,
  role: "ADJOINT",
  firstName: "Alice",
  lastName: "Coach",
  phone: null,
  birthDate: null,
};

const playerDetail = {
  id: 100,
  licenseNumber: null,
  nationality: null,
  preferredFoot: null,
  member: {
    id: 42,
    firstName: "Karim",
    lastName: "Benali",
    phone: null,
    gender: null,
    birthDate: null,
  },
  playerTeams: [
    { id: 200, teamId: 5, jerseyNumber: 9, mainPosition: "ST", secondaryPositions: [], joinDate: null },
  ],
};

function renderActions(row: RosterActionRow, overrides: Partial<{ canEdit: boolean; canDelete: boolean; onSuccess: jest.Mock }> = {}) {
  const onSuccess = overrides.onSuccess ?? jest.fn();
  renderWithIntl(
    <RosterRowActions
      clubId="1"
      teamId="5"
      row={row}
      canEdit={overrides.canEdit ?? true}
      canDelete={overrides.canDelete ?? true}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

describe("RosterRowActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("ne rend rien si ni canEdit ni canDelete", () => {
    renderActions(playerRow, { canEdit: false, canDelete: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("n'affiche que Supprimer si canEdit est faux", async () => {
    const user = userEvent.setup();
    renderActions(playerRow, { canEdit: false, canDelete: true });

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(await screen.findByText("Supprimer")).toBeInTheDocument();
    expect(screen.queryByText("Éditer")).not.toBeInTheDocument();
    expect(screen.queryByText("Archiver")).not.toBeInTheDocument();
  });

  describe("Éditer — ligne JOUEUR", () => {
    it("récupère le détail complet du joueur puis ouvre PlayerFormDialog pré-rempli", async () => {
      mockApiFetch.mockResolvedValueOnce(jsonResponse(playerDetail));
      const user = userEvent.setup();
      renderActions(playerRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Éditer"));

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/100?teamId=5",
        expect.anything(),
      );
      const firstNameInput = await screen.findByLabelText<HTMLInputElement>("Prénom");
      expect(firstNameInput).toHaveValue("Karim");
    });

    it("affiche une erreur si la récupération du détail échoue", async () => {
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ code: "PLAYERS.NOT_FOUND" }, false));
      const user = userEvent.setup();
      renderActions(playerRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Éditer"));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
      expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();
    });
  });

  describe("Éditer — ligne STAFF", () => {
    it("ouvre StaffFormDialog directement, sans appel réseau (RosterRow porte déjà tout ce qu'il édite)", async () => {
      const user = userEvent.setup();
      renderActions(staffRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Éditer"));

      expect(mockApiFetch).not.toHaveBeenCalled();
      const firstNameInput = await screen.findByLabelText<HTMLInputElement>("Prénom");
      expect(firstNameInput).toHaveValue("Alice");
    });
  });

  describe("Archiver", () => {
    it("appelle le PATCH .../players/:id/archive pour un joueur, après confirmation", async () => {
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
      const user = userEvent.setup();
      const onSuccess = renderActions(playerRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Archiver"));
      await user.click(await screen.findByRole("button", { name: "Archiver" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/players/200/archive",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("appelle le PATCH .../staff/:id/archive pour un membre du staff", async () => {
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
      const user = userEvent.setup();
      renderActions(staffRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Archiver"));
      await user.click(await screen.findByRole("button", { name: "Archiver" }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/clubs/1/teams/5/staff/900/archive",
          expect.objectContaining({ method: "PATCH" }),
        ),
      );
    });
  });

  describe("Supprimer", () => {
    it("supprime directement si aucune référence ne bloque", async () => {
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
      const user = userEvent.setup();
      const onSuccess = renderActions(playerRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Supprimer"));
      await user.click(await screen.findByRole("button", { name: "Supprimer" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/members/42",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("bascule vers la confirmation renforcée sur 409 MEMBERS.REFERENCED_ELSEWHERE, puis force l'anonymisation", async () => {
      mockApiFetch
        .mockResolvedValueOnce(jsonResponse({ code: "MEMBERS.REFERENCED_ELSEWHERE" }, false))
        .mockResolvedValueOnce(jsonResponse({}));
      const user = userEvent.setup();
      const onSuccess = renderActions(staffRow);

      await user.click(screen.getByRole("button", { name: "Actions" }));
      await user.click(await screen.findByText("Supprimer"));
      await user.click(await screen.findByRole("button", { name: "Supprimer" }));

      expect(await screen.findByText("Confirmer la suppression complète ?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Confirmer et anonymiser" }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/members/90",
        expect.objectContaining({ method: "DELETE", body: JSON.stringify({ forceAnonymize: true }) }),
      );
    });
  });
});
