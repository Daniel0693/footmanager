import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ConvocationsTab } from "./convocations-tab";

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

function attendance(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    playerId: 10,
    convocationStatus: "PENDING",
    player: { id: 10, member: { id: 20, firstName: "Tom", lastName: "Joueur" } },
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", matchId = "900") {
  return renderWithIntl(<ConvocationsTab clubId={clubId} teamId={teamId} matchId={matchId} />);
}

describe("ConvocationsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("affiche un état vide quand aucun joueur n'est convoqué", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [], canManage: false }));

    renderTab();

    expect(await screen.findByText("Aucun joueur convoqué pour l'instant")).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(await screen.findByText("Impossible de charger les convocations")).toBeInTheDocument();
  });

  it("canManage=false (Player) : boutons Accepter/Décliner, pas de bouton Convoquer", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [attendance()], canManage: false }),
    );

    renderTab();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accepter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Décliner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Convoquer des joueurs" })).not.toBeInTheDocument();
  });

  it("Player accepte sa convocation : PATCH convocationStatus=ACCEPTED", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ data: [attendance()], canManage: false }),
    );
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [attendance()], canManage: false }));

    await user.click(screen.getByRole("button", { name: "Accepter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/attendances/1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/1"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ convocationStatus: "ACCEPTED" });
  });

  it("canManage=true (Coach) : bouton Convoquer visible, statut de convocation modifiable, retrait disponible", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [attendance({ convocationStatus: "ACCEPTED" })], canManage: true }),
    );

    renderTab();

    expect(await screen.findByText("Tom Joueur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convoquer des joueurs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Statut de convocation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En attente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Présent confirmé" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Absent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer" })).toBeInTheDocument();
  });

  it("Coach modifie directement le statut de convocation en un clic", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ data: [attendance()], canManage: true }),
    );
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(
      jsonResponse({ data: [attendance({ convocationStatus: "ACCEPTED" })], canManage: true }),
    );

    await user.click(screen.getByRole("button", { name: "Présent confirmé" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/attendances/1",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(
      ([url, init]) => (url as string).endsWith("/1") && (init as RequestInit)?.method === "PATCH",
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ convocationStatus: "ACCEPTED" });
  });

  it("Coach retire une convocation : confirme puis envoie un DELETE", async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ data: [attendance()], canManage: true }),
    );
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [], canManage: true }));

    await user.click(screen.getByRole("button", { name: "Retirer" }));
    await user.click(screen.getByRole("button", { name: "Retirer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/attendances/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("Coach convoque un nouveau joueur : charge l'effectif, exclut les joueurs déjà convoqués, POST bulk", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/roster")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              { role: "PLAYER", playerId: 10, firstName: "Tom", lastName: "Joueur" },
              { role: "PLAYER", playerId: 11, firstName: "Léa", lastName: "Autre" },
              { role: "PRINCIPAL", playerId: null, firstName: "Coach", lastName: "Un" },
            ],
          }),
        );
      }
      if (url.endsWith("/bulk")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({ data: [attendance()], canManage: true }));
    });
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Tom Joueur");

    await user.click(screen.getByRole("button", { name: "Convoquer des joueurs" }));

    // Tom (déjà convoqué) n'apparaît pas dans la liste à cocher, Léa oui.
    expect(await screen.findByText("Léa Autre")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Convoquer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/matches/900/attendances/bulk",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/bulk"));
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({ playerIds: [11] });
    expect(toast.success).toHaveBeenCalled();
  });
});
