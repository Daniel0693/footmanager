import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingMatch, MatchFormDialog } from "./match-form-dialog";

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

const participantsResponse = jsonResponse({
  data: [
    { id: 1, internalTeam: { id: 5, name: "U15" }, externalTeam: null },
    { id: 2, internalTeam: null, externalTeam: { id: 50, name: "FC Rivaux" } },
  ],
});

const existingMatch: ExistingMatch = {
  id: 900,
  homeParticipantId: 1,
  awayParticipantId: 2,
  scheduledAt: "2026-09-15T15:00:00.000Z",
  round: 1,
  status: "SCHEDULED",
  scoreHome: null,
  scoreAway: null,
};

describe("MatchFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(participantsResponse);
  });

  it("mode création : sélectionne les deux équipes et planifie la rencontre", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 900 }));
      return Promise.resolve(participantsResponse);
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <MatchFormDialog
        clubId="1"
        teamId="5"
        championshipId="100"
        onSuccess={onSuccess}
        trigger={<Button>Planifier une rencontre</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Planifier une rencontre" }));
    expect(
      await screen.findByRole("heading", { name: "Planifier une rencontre" }),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Équipe à domicile"));
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.click(screen.getByLabelText("Équipe à l'extérieur"));
    await user.click(await screen.findByRole("option", { name: "FC Rivaux" }));
    await user.type(screen.getByLabelText("Date et heure"), "2026-09-15T15:00");
    await user.click(screen.getByRole("button", { name: "Planifier" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Rencontre planifiée avec succès");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("refuse si les deux équipes sélectionnées sont identiques", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <MatchFormDialog
        clubId="1"
        teamId="5"
        championshipId="100"
        onSuccess={jest.fn()}
        trigger={<Button>Planifier une rencontre</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Planifier une rencontre" }));
    await user.click(screen.getByLabelText("Équipe à domicile"));
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.click(screen.getByLabelText("Équipe à l'extérieur"));
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.type(screen.getByLabelText("Date et heure"), "2026-09-15T15:00");
    await user.click(screen.getByRole("button", { name: "Planifier" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Les deux équipes d'une rencontre doivent être différentes",
      ),
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/clubs/1/teams/5/championships/100/matches",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("mode édition : ne propose pas de changer les équipes, permet de saisir le score et terminer la rencontre", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") return Promise.resolve(jsonResponse(existingMatch));
      return Promise.resolve(participantsResponse);
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <MatchFormDialog
        clubId="1"
        teamId="5"
        championshipId="100"
        match={existingMatch}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(
      await screen.findByRole("heading", { name: "Modifier la rencontre" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Équipe à domicile")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Statut"));
    await user.click(await screen.findByRole("option", { name: "Terminée" }));
    await user.type(screen.getByLabelText("Score (domicile)"), "3");
    await user.type(screen.getByLabelText("Score (extérieur)"), "1");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches/900",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            scheduledAt: new Date(existingMatch.scheduledAt).toISOString(),
            round: 1,
            status: "FINISHED",
            scoreHome: 3,
            scoreAway: 1,
          }),
        }),
      ),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("refuse de passer à Terminée sans les deux scores", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <MatchFormDialog
        clubId="1"
        teamId="5"
        championshipId="100"
        match={existingMatch}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await screen.findByRole("heading", { name: "Modifier la rencontre" });

    await user.click(screen.getByLabelText("Statut"));
    await user.click(await screen.findByRole("option", { name: "Terminée" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Le score complet est requis pour terminer une rencontre",
      ),
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/clubs/1/teams/5/championships/100/matches/900",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
