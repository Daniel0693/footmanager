import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { AddStaffMemberDialog } from "./add-staff-member-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
const mockParseErrorCode = jest.fn().mockResolvedValue("AUTH.UNKNOWN");
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: (...args: unknown[]) => mockParseErrorCode(...args),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

// Même calcul que todayIsoDate() dans le composant (date locale, pas UTC).
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function renderDialog(canAssignPrincipal = true, onSuccess = jest.fn()) {
  renderWithIntl(
    <AddStaffMemberDialog
      clubId="1"
      teamId="5"
      canAssignPrincipal={canAssignPrincipal}
      onSuccess={onSuccess}
      trigger={<Button>Ajouter un membre du staff</Button>}
    />,
  );
  return onSuccess;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Ajouter un membre du staff" }),
  );
  await screen.findByLabelText("Prénom");
}

describe("AddStaffMemberDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("préremplit le rôle à Co-entraîneur et la date de début à aujourd'hui", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    expect(
      screen.getByRole("combobox", { name: "Rôle" }),
    ).toHaveTextContent("Co-entraîneur");
    expect(screen.getByLabelText<HTMLInputElement>("Date d'arrivée")).toHaveValue(
      todayIsoDate(),
    );
  });

  it("le prénom et le nom sont requis avant envoi", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("envoie un seul POST .../staff avec l'identité et le rôle par défaut", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ id: 301 }));
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Nadia");
    await user.type(screen.getByLabelText("Nom"), "Roux");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/staff",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toEqual({
      firstName: "Nadia",
      lastName: "Roux",
      phone: undefined,
      gender: undefined,
      birthDate: undefined,
      staffRole: "CO_ENTRAINEUR",
      startDate: todayIsoDate(),
    });
  });

  it("transmet téléphone, genre et date de naissance quand ils sont renseignés", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ id: 301 }));
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Nadia");
    await user.type(screen.getByLabelText("Nom"), "Roux");
    await user.type(screen.getByLabelText("Téléphone"), "0601020304");
    await user.type(screen.getByLabelText("Date de naissance"), "1990-05-02");
    await user.click(screen.getByRole("combobox", { name: "Genre" }));
    await user.click(await screen.findByRole("option", { name: "Femme" }));
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      phone: "0601020304",
      gender: "FEMALE",
      birthDate: "1990-05-02",
    });
  });

  it("propose Principal comme rôle quand canAssignPrincipal est vrai", async () => {
    const user = userEvent.setup();
    renderDialog(true);
    await openDialog(user);

    await user.click(screen.getByRole("combobox", { name: "Rôle" }));

    expect(await screen.findByRole("option", { name: "Principal" })).toBeInTheDocument();
  });

  it("ne propose pas Principal comme rôle quand canAssignPrincipal est faux", async () => {
    const user = userEvent.setup();
    renderDialog(false);
    await openDialog(user);

    await user.click(screen.getByRole("combobox", { name: "Rôle" }));
    await screen.findByRole("option", { name: "Adjoint" });

    expect(screen.queryByRole("option", { name: "Principal" })).not.toBeInTheDocument();
  });

  it("transmet le rôle Principal choisi quand canAssignPrincipal est vrai", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ id: 301 }));
    const user = userEvent.setup();
    renderDialog(true);
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Nadia");
    await user.type(screen.getByLabelText("Nom"), "Roux");
    await user.click(screen.getByRole("combobox", { name: "Rôle" }));
    await user.click(await screen.findByRole("option", { name: "Principal" }));
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ staffRole: "PRINCIPAL" });
  });

  it("garde la modale ouverte et affiche une erreur si le backend refuse (ex. pas Principal)", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse(null, false));
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await openDialog(user);

    await user.type(screen.getByLabelText("Prénom"), "Nadia");
    await user.type(screen.getByLabelText("Nom"), "Roux");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("Prénom")).toBeInTheDocument();
  });
});
