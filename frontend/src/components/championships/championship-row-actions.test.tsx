import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ChampionshipRowActions } from "./championship-row-actions";
import type { ExistingChampionship } from "./championship-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

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

const championship: ExistingChampionship = {
  id: 100,
  seasonId: 20,
  name: "Championnat Automne",
  startDate: "2026-09-01T00:00:00.000Z",
  endDate: "2026-12-15T00:00:00.000Z",
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakerRules: ["GOAL_DIFFERENCE"],
  tiebreakerPreset: null,
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
  gameFormat: "ELEVEN",
};

function renderActions(
  overrides: Partial<{ canManage: boolean; onSuccess: jest.Mock }> = {},
) {
  const onSuccess = overrides.onSuccess ?? jest.fn();
  renderWithIntl(
    <ChampionshipRowActions
      clubId="1"
      teamId="5"
      championship={championship}
      canManage={overrides.canManage ?? true}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

describe("ChampionshipRowActions", () => {
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

  it("Modifier ouvre la modale d'édition pré-remplie", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Modifier"));

    expect(
      await screen.findByRole("heading", { name: "Modifier le championnat" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Championnat Automne");
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
        "/clubs/1/teams/5/championships/100",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
