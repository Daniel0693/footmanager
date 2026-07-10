import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { BulkCreatePlayersDialog } from "./bulk-create-players-dialog";

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

function renderDialog(onSuccess = jest.fn()) {
  renderWithIntl(
    <BulkCreatePlayersDialog
      clubId="1"
      teamId="5"
      onSuccess={onSuccess}
      trigger={<Button>Créer des joueurs en masse</Button>}
    />,
  );
  return onSuccess;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Créer des joueurs en masse" }));
  await screen.findByLabelText("Prénom");
}

describe("BulkCreatePlayersDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("s'ouvre avec une seule ligne vide", async () => {
    const user = userEvent.setup();
    renderDialog();

    await openDialog(user);

    expect(screen.getAllByLabelText("Prénom")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retirer cette ligne" })).toBeDisabled();
  });

  it("Ajouter une ligne ajoute une nouvelle ligne vide, activant Retirer", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));

    expect(screen.getAllByLabelText("Prénom")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Retirer cette ligne" })[0]).toBeEnabled();
  });

  it("Retirer cette ligne supprime la ligne correspondante", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));
    await user.type(screen.getAllByLabelText("Prénom")[0], "Karim");

    await user.click(screen.getAllByRole("button", { name: "Retirer cette ligne" })[1]);

    expect(screen.getAllByLabelText("Prénom")).toHaveLength(1);
    expect(screen.getAllByLabelText<HTMLInputElement>("Prénom")[0]).toHaveValue("Karim");
  });

  it("le prénom et le nom sont requis avant envoi", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("envoie POST .../roster/bulk avec toutes les lignes en une fois", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([{ id: 1 }, { id: 2 }]));
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));

    const firstNames = screen.getAllByLabelText("Prénom");
    const lastNames = screen.getAllByLabelText("Nom");
    await user.type(firstNames[0], "Karim");
    await user.type(lastNames[0], "Benali");
    await user.type(firstNames[1], "Zoe");
    await user.type(lastNames[1], "Martin");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/roster/bulk",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ firstName: "Karim", lastName: "Benali" });
    expect(body.items[1]).toMatchObject({ firstName: "Zoe", lastName: "Martin" });
  });

  it("garde la modale ouverte et affiche une erreur globale si le backend refuse (ex. conflit de maillot)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(null, false));
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Karim");
    await user.type(screen.getByLabelText("Nom"), "Benali");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("Prénom")).toBeInTheDocument();
  });

  it("le numéro de maillot et le poste principal sont transmis pour chaque ligne", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Karim");
    await user.type(screen.getByLabelText("Nom"), "Benali");
    await user.type(screen.getByLabelText("Numéro de maillot"), "9");
    await user.click(screen.getByRole("combobox", { name: "Poste principal" }));
    await user.click(await screen.findByRole("option", { name: "Buteur" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.items[0]).toMatchObject({ jerseyNumber: 9, mainPosition: "ST" });
  });
});
