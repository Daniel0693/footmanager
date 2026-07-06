import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingNote, NoteFormDialog } from "./note-form-dialog";

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

const existingNote: ExistingNote = {
  id: 1,
  visibility: "PRIVE",
  title: "Observation interne",
  content: "Ressenti staff uniquement",
};

describe("NoteFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : le contenu est requis, la visibilité par défaut est Semi-privé", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <NoteFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une note</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une note" }));
    expect(await screen.findByRole("combobox")).toHaveTextContent("Semi-privé");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le contenu est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche l'indice de visibilité correspondant et change quand on sélectionne une autre option", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <NoteFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une note</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une note" }));
    expect(await screen.findByText("Visible par le joueur et le staff")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Privé" }));

    expect(await screen.findByText("Visible par le staff uniquement")).toBeInTheDocument();
  });

  it("mode création : POST avec teamId en query, titre optionnel omis si vide", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <NoteFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={onSuccess}
        trigger={<Button>Ajouter une note</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une note" }));
    await user.type(screen.getByLabelText("Contenu"), "Bonne séance aujourd'hui");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/notes?teamId=5",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          visibility: "SEMI_PRIVE",
          content: "Bonne séance aujourd'hui",
        }),
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit le formulaire (visibilité, titre, contenu) et envoie un PATCH avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <NoteFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        note={existingNote}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(await screen.findByRole("combobox")).toHaveTextContent("Privé");
    const titleInput = screen.getByLabelText<HTMLInputElement>("Titre");
    expect(titleInput).toHaveValue("Observation interne");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Contenu")).toHaveValue(
      "Ressenti staff uniquement",
    );

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/players/10/notes/1?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("PLAYER_NOTES.PLAYER_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <NoteFormDialog
        clubId="1"
        teamId="5"
        playerId="10"
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter une note</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter une note" }));
    await user.type(screen.getByLabelText("Contenu"), "Résumé");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ce joueur n'appartient pas à ce club"),
    );
  });
});
