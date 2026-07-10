import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingStaff, StaffFormDialog } from "./staff-form-dialog";

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

const existingStaff: ExistingStaff = {
  memberId: 90,
  staffId: 900,
  firstName: "Alice",
  lastName: "Coach",
  phone: "+41 78 000 00 00",
  birthDate: "1985-04-12",
  staffRole: "ADJOINT",
};

describe("StaffFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("pré-remplit le formulaire et enchaîne les 2 PATCH (membre puis staff)", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ id: 90 }))
      .mockResolvedValueOnce(jsonResponse({ id: 900 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <StaffFormDialog
        clubId="1"
        teamId="5"
        staff={existingStaff}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    const firstNameInput = await screen.findByLabelText<HTMLInputElement>("Prénom");
    expect(firstNameInput).toHaveValue("Alice");

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      "/clubs/1/members/90?teamId=5",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, memberOptions] = mockApiFetch.mock.calls[0];
    expect(JSON.parse((memberOptions as RequestInit).body as string)).toEqual({
      firstName: "Alice",
      lastName: "Coach",
      phone: "+41 78 000 00 00",
      birthDate: "1985-04-12",
    });
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/teams/5/staff/900",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, staffOptions] = mockApiFetch.mock.calls[1];
    expect(JSON.parse((staffOptions as RequestInit).body as string)).toEqual({
      staffRole: "ADJOINT",
    });
  });

  it("le prénom et le nom sont requis", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <StaffFormDialog
        clubId="1"
        teamId="5"
        staff={existingStaff}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.clear(await screen.findByLabelText("Prénom"));
    await user.clear(screen.getByLabelText("Nom"));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Le prénom est requis")).toBeInTheDocument();
    expect(screen.getByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("pré-remplit la date de naissance même quand l'API renvoie une date ISO complète (régression 2026-07-10)", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <StaffFormDialog
        clubId="1"
        teamId="5"
        staff={{ ...existingStaff, birthDate: "1985-04-12T00:00:00.000Z" }}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    expect(await screen.findByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue(
      "1985-04-12",
    );
  });

  it("mode contrôlé : s'ouvre déjà pré-rempli via open=true, sans trigger visible", async () => {
    renderWithIntl(
      <StaffFormDialog
        clubId="1"
        teamId="5"
        staff={existingStaff}
        open={true}
        onOpenChange={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );

    expect(await screen.findByLabelText<HTMLInputElement>("Prénom")).toHaveValue("Alice");
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
  });

  it("le rôle du staff est modifiable et transmis au PATCH staff", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ id: 90 }))
      .mockResolvedValueOnce(jsonResponse({ id: 900 }));
    const user = userEvent.setup();

    renderWithIntl(
      <StaffFormDialog
        clubId="1"
        teamId="5"
        staff={existingStaff}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await screen.findByLabelText("Prénom");
    await user.click(screen.getByText("Adjoint"));
    await user.click(await screen.findByRole("option", { name: "Principal" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, staffOptions] = mockApiFetch.mock.calls[1];
    expect(JSON.parse((staffOptions as RequestInit).body as string)).toEqual({
      staffRole: "PRINCIPAL",
    });
  });
});
