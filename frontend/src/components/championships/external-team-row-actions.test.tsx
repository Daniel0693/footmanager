import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExternalTeamRowActions } from "./external-team-row-actions";
import type { ExistingExternalTeam } from "./external-team-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest
    .fn()
    .mockImplementation(async (response: { json: () => Promise<{ code?: string }> }) => {
      const body = await response.json().catch(() => null);
      return body?.code ?? "AUTH.UNKNOWN";
    }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const externalTeam: ExistingExternalTeam = {
  id: 100,
  name: "FC Rivaux",
  city: "Genève",
  country: "Suisse",
  notes: null,
};

function renderActions(
  overrides: Partial<{ canManage: boolean; onSuccess: jest.Mock }> = {},
) {
  const onSuccess = overrides.onSuccess ?? jest.fn();
  renderWithIntl(
    <ExternalTeamRowActions
      clubId="1"
      teamId="5"
      externalTeam={externalTeam}
      canManage={overrides.canManage ?? true}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

describe("ExternalTeamRowActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("ne rend rien si canManage est faux", () => {
    renderActions({ canManage: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("propose Modifier et Supprimer", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(await screen.findByText("Modifier")).toBeInTheDocument();
    expect(screen.getByText("Supprimer")).toBeInTheDocument();
  });

  it("Modifier ouvre la modale d'édition pré-remplie", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Modifier"));

    expect(
      await screen.findByRole("heading", { name: "Modifier l'équipe adverse" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("FC Rivaux");
  });

  it("Supprimer après confirmation appelle le DELETE avec ?teamId=", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    const user = userEvent.setup();
    const onSuccess = renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Supprimer"));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams/100?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
