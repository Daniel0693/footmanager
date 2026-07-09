import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { AbsenceFormDialog, ExistingAbsence } from "./absence-form-dialog";

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

const existingAbsence: ExistingAbsence = {
  id: 1,
  reason: "INJURY",
  description: "Douleur au genou droit",
  startDate: "2026-07-10T00:00:00.000Z",
  endDate: "2026-07-20T00:00:00.000Z",
  isExcused: true,
};

describe("AbsenceFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : motif par défaut Blessure, dates requises, isExcused non renseigné par défaut", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une absence</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
    expect(screen.getByRole("combobox", { name: "Motif" })).toHaveTextContent("Blessure");
    expect(screen.getByRole("combobox", { name: "Excusée" })).toHaveTextContent("Non renseigné");

    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText("La date de début est requise")).toBeInTheDocument();
    expect(screen.getByText("La date de fin est requise")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("mode création : POST avec teamId en query, motif choisi, description optionnelle, isExcused omis si non renseigné", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter une absence</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
    await user.click(screen.getByRole("combobox", { name: "Motif" }));
    await user.click(await screen.findByRole("option", { name: "Maladie" }));
    await user.type(screen.getByLabelText("Description"), "Testé positif au COVID");
    await user.type(screen.getByLabelText("Date de début"), "2026-07-10");
    await user.type(screen.getByLabelText("Date de fin"), "2026-07-20");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/absences?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reason: "ILLNESS",
          description: "Testé positif au COVID",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          isExcused: undefined,
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit le formulaire et envoie un PATCH avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        absence={existingAbsence}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByRole("combobox", { name: "Motif" })).toHaveTextContent("Blessure");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Description")).toHaveValue(
      "Douleur au genou droit",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Date de début")).toHaveValue("2026-07-10");
    expect(screen.getByLabelText<HTMLInputElement>("Date de fin")).toHaveValue("2026-07-20");
    expect(screen.getByRole("combobox", { name: "Excusée" })).toHaveTextContent("Excusée");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/absences/1?teamId=5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          reason: "INJURY",
          description: "Douleur au genou droit",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          isExcused: true,
        }),
      }),
    );
  });

  it("permet de choisir \"Non excusée\"", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        absence={existingAbsence}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("combobox", { name: "Excusée" }));
    await user.click(await screen.findByRole("option", { name: "Non excusée" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/absences/1?teamId=5",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          reason: "INJURY",
          description: "Douleur au genou droit",
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          isExcused: false,
        }),
      }),
    );
  });

  it("canSetExcused=false : masque le champ Excusé et l'omet toujours de l'envoi", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        canSetExcused={false}
        trigger={<Button>Ajouter une absence</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
    expect(screen.queryByRole("combobox", { name: "Excusée" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Date de début"), "2026-07-10");
    await user.type(screen.getByLabelText("Date de fin"), "2026-07-20");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/absences?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          reason: "INJURY",
          description: undefined,
          startDate: "2026-07-10",
          endDate: "2026-07-20",
          isExcused: undefined,
        }),
      }),
    );
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("PLAYER_ABSENCES.PLAYER_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <AbsenceFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une absence</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une absence" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-07-10");
    await user.type(screen.getByLabelText("Date de fin"), "2026-07-20");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce joueur n'appartient pas à ce club"),
    );
  });
});
