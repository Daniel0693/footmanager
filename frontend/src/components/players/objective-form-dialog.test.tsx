import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingObjective, ObjectiveFormDialog } from "./objective-form-dialog";

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

const existingObjective: ExistingObjective = {
  id: 1,
  theme: "MENTAL",
  description: "Travailler la confiance avant les matchs",
  horizon: "LONG_TERM",
  status: "IN_PROGRESS",
  visibility: "PRIVE",
  startDate: "2026-01-01T00:00:00.000Z",
  dueDate: "2026-06-30T00:00:00.000Z",
  completedDate: null,
};

describe("ObjectiveFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : valeurs par défaut (Technique/Court terme/Programmé/Semi-privé), description requise", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ObjectiveFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un objectif</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un objectif" }));
    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes).toHaveLength(4);
    expect(comboboxes[0]).toHaveTextContent("Technique");
    expect(comboboxes[1]).toHaveTextContent("Court terme");
    expect(comboboxes[2]).toHaveTextContent("Programmé");
    expect(comboboxes[3]).toHaveTextContent("Semi-privé");
    expect(screen.getByText("Visible par le joueur et le staff")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText("La description est requise")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("mode création : POST avec teamId en query, dates omises si vides", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ObjectiveFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un objectif</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un objectif" }));
    await user.type(screen.getByLabelText("Description"), "Améliorer la frappe du pied faible");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/objectives?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          theme: "TECHNIQUE",
          description: "Améliorer la frappe du pied faible",
          horizon: "SHORT_TERM",
          status: "PLANNED",
          visibility: "SEMI_PRIVE",
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit le formulaire (thème/horizon/statut/visibilité/dates) et envoie un PATCH avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ObjectiveFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        objective={existingObjective}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes[0]).toHaveTextContent("Mental");
    expect(comboboxes[1]).toHaveTextContent("Long terme");
    expect(comboboxes[2]).toHaveTextContent("En cours");
    expect(comboboxes[3]).toHaveTextContent("Privé");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Description")).toHaveValue(
      "Travailler la confiance avant les matchs",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Date de début")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText<HTMLInputElement>("Échéance")).toHaveValue("2026-06-30");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/objectives/1?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("permet de changer le statut vers Réussi et de renseigner la date de réalisation", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ObjectiveFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        objective={existingObjective}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const comboboxes = await screen.findAllByRole("combobox");
    await user.click(comboboxes[2]);
    await user.click(await screen.findByRole("option", { name: "Réussi" }));
    await user.type(screen.getByLabelText("Date de réalisation"), "2026-07-06");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/objectives/1?teamId=5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          theme: "MENTAL",
          description: "Travailler la confiance avant les matchs",
          horizon: "LONG_TERM",
          status: "ACHIEVED",
          visibility: "PRIVE",
          startDate: "2026-01-01",
          dueDate: "2026-06-30",
          completedDate: "2026-07-06",
        }),
      }),
    );
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("PLAYER_OBJECTIVES.PLAYER_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <ObjectiveFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un objectif</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un objectif" }));
    await user.type(screen.getByLabelText("Description"), "Résumé");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce joueur n'appartient pas à ce club"),
    );
  });
});
