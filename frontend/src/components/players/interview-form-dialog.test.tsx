import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingInterview, InterviewFormDialog } from "./interview-form-dialog";

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

const existingInterview: ExistingInterview = {
  id: 1,
  date: "2026-01-15T00:00:00.000Z",
  subject: "Bilan mi-saison",
  summary: "Bonne progression technique",
  staffFeedback: "Continuer sur cette lancée",
  staffAssessment: "Joueur en confiance",
  playerFeedback: "Le joueur se sent prêt",
};

describe("InterviewFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : seuls date/sujet/résumé sont requis (retour de l'encadrant optionnel)", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <InterviewFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un entretien</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un entretien" }));
    await screen.findByLabelText("Sujet");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("La date est requise")).toBeInTheDocument();
    expect(screen.getByText("Le sujet est requis")).toBeInTheDocument();
    expect(screen.getByText("Le résumé est requis")).toBeInTheDocument();
    expect(screen.queryByText("Le retour de l'encadrant est requis")).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("permet de planifier un entretien sans aucun des 3 champs de retour (à compléter plus tard)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <InterviewFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un entretien</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un entretien" }));
    await user.type(screen.getByLabelText("Date"), "2026-12-01");
    await user.type(screen.getByLabelText("Sujet"), "Bilan planifié");
    await user.type(screen.getByLabelText("Résumé de l'entretien"), "Points à aborder");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/interviews?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          date: "2026-12-01",
          subject: "Bilan planifié",
          summary: "Points à aborder",
        }),
      }),
    );
  });

  it("mode création : POST avec teamId en query, les 3 champs de retour remplis", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <InterviewFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un entretien</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un entretien" }));
    await user.type(screen.getByLabelText("Date"), "2026-01-15");
    await user.type(screen.getByLabelText("Sujet"), "Bilan mi-saison");
    await user.type(screen.getByLabelText("Résumé de l'entretien"), "Bonne progression");
    await user.type(screen.getByLabelText("Retour de l'encadrant"), "Continuer ainsi");
    await user.type(screen.getByLabelText("Retour du joueur"), "Le joueur se sent prêt");
    await user.type(
      screen.getByLabelText("Évaluation interne de l'encadrant"),
      "Ressenti positif",
    );
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/interviews?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          date: "2026-01-15",
          subject: "Bilan mi-saison",
          summary: "Bonne progression",
          staffFeedback: "Continuer ainsi",
          staffAssessment: "Ressenti positif",
          playerFeedback: "Le joueur se sent prêt",
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit le formulaire (y compris les champs de retour) et envoie un PATCH avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <InterviewFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        interview={existingInterview}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const subjectInput = await screen.findByLabelText<HTMLInputElement>("Sujet");
    expect(subjectInput).toHaveValue("Bilan mi-saison");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Retour de l'encadrant")).toHaveValue(
      "Continuer sur cette lancée",
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>("Retour du joueur")).toHaveValue(
      "Le joueur se sent prêt",
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Évaluation interne de l'encadrant"),
    ).toHaveValue("Joueur en confiance");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/interviews/1?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("PLAYER_INTERVIEWS.PLAYER_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <InterviewFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un entretien</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un entretien" }));
    await user.type(screen.getByLabelText("Date"), "2026-01-15");
    await user.type(screen.getByLabelText("Sujet"), "Bilan mi-saison");
    await user.type(screen.getByLabelText("Résumé de l'entretien"), "Bonne progression");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce joueur n'appartient pas à ce club"),
    );
  });
});
