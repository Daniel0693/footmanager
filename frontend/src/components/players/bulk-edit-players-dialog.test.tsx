import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { BulkEditPlayersDialog, type BulkEditableRow } from "./bulk-edit-players-dialog";

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

const rows: BulkEditableRow[] = [
  {
    id: 200,
    firstName: "Karim",
    lastName: "Benali",
    phone: null,
    birthDate: null,
    jerseyNumber: 9,
    mainPosition: "ST",
  },
  {
    id: 201,
    firstName: "Zoe",
    lastName: "Martin",
    phone: "+41 78 000 00 00",
    birthDate: "2011-03-04",
    jerseyNumber: 10,
    mainPosition: null,
  },
];

function renderDialog(onSuccess = jest.fn(), rowsOverride = rows) {
  renderWithIntl(
    <BulkEditPlayersDialog
      clubId="1"
      teamId="5"
      rows={rowsOverride}
      onSuccess={onSuccess}
      trigger={<Button>Éditer des joueurs en masse</Button>}
    />,
  );
  return onSuccess;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Éditer des joueurs en masse" }));
  await screen.findAllByLabelText("Prénom");
}

describe("BulkEditPlayersDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("pré-remplit une ligne par joueur fourni, sans contrôle d'ajout/retrait", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    const firstNames = screen.getAllByLabelText<HTMLInputElement>("Prénom");
    expect(firstNames).toHaveLength(2);
    expect(firstNames[0]).toHaveValue("Karim");
    expect(firstNames[1]).toHaveValue("Zoe");
    expect(screen.queryByRole("button", { name: "Ajouter une ligne" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer cette ligne" })).not.toBeInTheDocument();
  });

  it("affiche la note limitant la portée aux lignes actuellement affichées", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    expect(
      screen.getByText(
        "Seules les lignes actuellement affichées dans le tableau (page et filtres en cours) sont modifiables ici.",
      ),
    ).toBeInTheDocument();
  });

  it("envoie PATCH .../roster/bulk avec l'id de chaque PlayerTeam existant", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([{ id: 200 }, { id: 201 }]));
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await openDialog(user);

    const lastNames = screen.getAllByLabelText("Nom");
    await user.clear(lastNames[0]);
    await user.type(lastNames[0], "Benali-Modifié");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/roster/bulk",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.items).toEqual([
      expect.objectContaining({ id: 200, lastName: "Benali-Modifié", jerseyNumber: 9, mainPosition: "ST" }),
      expect.objectContaining({ id: 201, lastName: "Martin", jerseyNumber: 10 }),
    ]);
  });

  it("le prénom et le nom restent requis", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.clear(screen.getAllByLabelText("Prénom")[0]);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
