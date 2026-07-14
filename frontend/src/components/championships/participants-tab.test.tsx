import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ParticipantsTab } from "./participants-tab";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest
    .fn()
    .mockImplementation(async (response: { json: () => Promise<{ code?: string }> }) => {
      const body = await response.json().catch(() => null);
      return body?.code ?? "AUTH.UNKNOWN";
    }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function participantsResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderTab() {
  return renderWithIntl(
    <ParticipantsTab clubId="1" teamId="5" championshipId="100" />,
  );
}

describe("ParticipantsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les participants du championnat au montage", async () => {
    mockApiFetch.mockResolvedValue(participantsResponse([]));

    renderTab();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/participants",
        expect.anything(),
      ),
    );
  });

  it("affiche un message si aucun participant", async () => {
    mockApiFetch.mockResolvedValue(participantsResponse([]));

    renderTab();

    expect(await screen.findByText("Aucun participant pour l'instant")).toBeInTheDocument();
  });

  it("liste les participants internes et externes", async () => {
    mockApiFetch.mockResolvedValue(
      participantsResponse([
        { id: 1, internalTeam: { id: 5, name: "U15" }, externalTeam: null },
        { id: 2, internalTeam: null, externalTeam: { id: 50, name: "FC Rivaux" } },
      ]),
    );

    renderTab();

    expect(await screen.findByText("U15")).toBeInTheDocument();
    expect(screen.getByText("FC Rivaux")).toBeInTheDocument();
  });

  it("cache les boutons Ajouter et la colonne Actions quand canManage est false", async () => {
    mockApiFetch.mockResolvedValue(
      participantsResponse(
        [{ id: 1, internalTeam: null, externalTeam: { id: 50, name: "FC Rivaux" } }],
        false,
      ),
    );

    renderTab();
    await screen.findByText("FC Rivaux");

    expect(screen.queryByRole("button", { name: "Ajouter notre équipe" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ajouter une équipe adverse" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer" })).not.toBeInTheDocument();
  });

  it("masque « Ajouter notre équipe » si elle participe déjà", async () => {
    mockApiFetch.mockResolvedValue(
      participantsResponse([{ id: 1, internalTeam: { id: 5, name: "U15" }, externalTeam: null }]),
    );

    renderTab();
    await screen.findByText("U15");

    expect(screen.queryByRole("button", { name: "Ajouter notre équipe" })).not.toBeInTheDocument();
  });

  it("Ajouter notre équipe envoie internalTeamId = teamId et rafraîchit la liste", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 900 }));
      return Promise.resolve(participantsResponse([]));
    });
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Aucun participant pour l'instant");

    await user.click(screen.getByRole("button", { name: "Ajouter notre équipe" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/participants",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ internalTeamId: 5 }),
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Participant ajouté avec succès");
  });

  it("Retirer un participant appelle le DELETE et rafraîchit la liste", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(
        participantsResponse([
          { id: 1, internalTeam: null, externalTeam: { id: 50, name: "FC Rivaux" } },
        ]),
      );
    });
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("FC Rivaux");

    await user.click(screen.getByRole("button", { name: "Retirer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/participants/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Participant retiré avec succès");
  });

  it("Ajouter une équipe adverse : sélectionne une équipe existante et l'ajoute", async () => {
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 901 }));
      if (url.includes("/external-teams")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              { id: 50, name: "FC Rivaux" },
              { id: 51, name: "AS Voisins" },
            ],
          }),
        );
      }
      return Promise.resolve(participantsResponse([]));
    });
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Aucun participant pour l'instant");

    await user.click(screen.getByRole("button", { name: "Ajouter une équipe adverse" }));
    await user.click(await screen.findByLabelText("Équipe adverse"));
    await user.click(await screen.findByRole("option", { name: "FC Rivaux" }));
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/participants",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ externalTeamId: 50 }),
        }),
      ),
    );
  });
});
