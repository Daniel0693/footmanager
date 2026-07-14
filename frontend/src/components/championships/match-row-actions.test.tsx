import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { MatchRowActions } from "./match-row-actions";
import type { ExistingMatch } from "./match-form-dialog";

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

const match: ExistingMatch = {
  id: 900,
  homeParticipantId: 1,
  awayParticipantId: 2,
  scheduledAt: "2026-09-15T15:00:00.000Z",
  round: 1,
  status: "SCHEDULED",
  scoreHome: null,
  scoreAway: null,
};

function renderActions(
  overrides: Partial<{ canManage: boolean; onSuccess: jest.Mock }> = {},
) {
  const onSuccess = overrides.onSuccess ?? jest.fn();
  renderWithIntl(
    <MatchRowActions
      clubId="1"
      teamId="5"
      championshipId="100"
      match={match}
      canManage={overrides.canManage ?? true}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

describe("MatchRowActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [] }));
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

  it("Supprimer après confirmation appelle le DELETE", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    const user = userEvent.setup();
    const onSuccess = renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Supprimer"));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches/900",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
