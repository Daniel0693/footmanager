import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import type { EvaluationAxis } from "./evaluation-tab";
import { EvaluationFormDialog, ExistingEvaluation } from "./evaluation-form-dialog";

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

const axes: EvaluationAxis[] = [
  {
    id: 1,
    categoryId: 1,
    name: "Technique",
    displayOrder: 1,
    criteria: [
      { id: 1, name: "Contrôle de balle", description: null },
      { id: 2, name: "Passe courte", description: null },
    ],
  },
  {
    id: 2,
    categoryId: 2,
    name: "Mental",
    displayOrder: 2,
    criteria: [{ id: 10, name: "Concentration", description: null }],
  },
];

const existingEvaluation: ExistingEvaluation = {
  id: 1,
  date: "2026-06-01T00:00:00.000Z",
  comments: "Bonne progression",
  scores: [
    { criterionId: 1, score: "7" },
    { criterionId: 2, score: "6" },
    { criterionId: 10, score: "8" },
  ],
};

async function fillAllScores(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Contrôle de balle : 7 sur 10" }));
  await user.click(screen.getByRole("button", { name: "Passe courte : 6 sur 10" }));
  await user.click(screen.getByRole("button", { name: "Concentration : 8 sur 10" }));
}

describe("EvaluationFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : affiche tous les critères groupés par catégorie ; date et scores sont requis avant envoi", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une évaluation</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une évaluation" }));
    expect(screen.getByText("Technique")).toBeInTheDocument();
    expect(screen.getByText("Mental")).toBeInTheDocument();
    expect(screen.getByText("Contrôle de balle")).toBeInTheDocument();
    expect(screen.getByText("Concentration")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("La date est requise")).toBeInTheDocument();
    expect(screen.getByText("Tous les critères doivent être notés")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche la moyenne de chaque catégorie en temps réel au fil de la saisie", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une évaluation</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une évaluation" }));
    const technique = within(screen.getByText("Technique").parentElement!);
    const mental = within(screen.getByText("Mental").parentElement!);
    expect(technique.getByText("—")).toBeInTheDocument();
    expect(mental.getByText("—")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Contrôle de balle : 8 sur 10" }));
    expect(technique.getByText("8.0")).toBeInTheDocument();
    expect(mental.getByText("—")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Passe courte : 6 sur 10" }));
    expect(technique.getByText("7.0")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concentration : 10 sur 10" }));
    expect(mental.getByText("10.0")).toBeInTheDocument();
  });

  it("mode création : POST avec teamId en query, un score par critère, commentaire omis si vide", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter une évaluation</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une évaluation" }));
    await user.type(screen.getByLabelText("Date"), "2026-06-15");
    await fillAllScores(user);
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/evaluations?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          date: "2026-06-15",
          comments: undefined,
          scores: [
            { criterionId: 1, score: 7 },
            { criterionId: 2, score: 6 },
            { criterionId: 10, score: 8 },
          ],
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit date/commentaire/scores existants et envoie un PATCH avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        evaluation={existingEvaluation}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByLabelText<HTMLInputElement>("Date")).toHaveValue("2026-06-01");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Commentaire")).toHaveValue(
      "Bonne progression",
    );
    expect(
      screen.getByRole("button", { name: "Contrôle de balle : 7 sur 10" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Concentration : 8 sur 10" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/evaluations/1?teamId=5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          date: "2026-06-01",
          comments: "Bonne progression",
          scores: [
            { criterionId: 1, score: 7 },
            { criterionId: 2, score: 6 },
            { criterionId: 10, score: 8 },
          ],
        }),
      }),
    );
  });

  it("mode édition : remplace le score d'un critère en cliquant une nouvelle étoile", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        evaluation={existingEvaluation}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Concentration : 10 sur 10" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/evaluations/1?teamId=5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          date: "2026-06-01",
          comments: "Bonne progression",
          scores: [
            { criterionId: 1, score: 7 },
            { criterionId: 2, score: 6 },
            { criterionId: 10, score: 10 },
          ],
        }),
      }),
    );
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("PLAYER_EVALUATIONS.CRITERION_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <EvaluationFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        axes={axes}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une évaluation</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une évaluation" }));
    await user.type(screen.getByLabelText("Date"), "2026-06-15");
    await fillAllScores(user);
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce critère n'appartient pas à ce club"),
    );
  });
});
