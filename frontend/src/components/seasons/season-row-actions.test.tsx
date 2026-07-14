import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonRowActions, type SeasonActionRow } from "./season-row-actions";

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

const draftSeason: SeasonActionRow = {
  id: 100,
  name: "Saison 2026-2027",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2027-06-30T00:00:00.000Z",
  status: "DRAFT",
  canManage: true,
};

const activeSeason: SeasonActionRow = {
  id: 50,
  name: "Saison 2025-2026",
  startDate: "2025-08-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  status: "ACTIVE",
  canManage: true,
};

function renderActions(
  season: SeasonActionRow,
  overrides: Partial<{
    currentActiveSeason: SeasonActionRow | null;
    onSuccess: jest.Mock;
  }> = {},
) {
  const onSuccess = overrides.onSuccess ?? jest.fn();
  renderWithIntl(
    <SeasonRowActions
      clubId="1"
      season={season}
      currentActiveSeason={overrides.currentActiveSeason ?? null}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
}

describe("SeasonRowActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("ne rend rien si canManage est faux (rôle en lecture seule)", () => {
    renderActions({ ...draftSeason, canManage: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("propose Activer/Modifier/Supprimer pour une saison DRAFT", async () => {
    const user = userEvent.setup();
    renderActions(draftSeason);

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(await screen.findByText("Activer")).toBeInTheDocument();
    expect(screen.getByText("Modifier")).toBeInTheDocument();
    expect(screen.getByText("Supprimer")).toBeInTheDocument();
  });

  it("ne propose que Modifier pour une saison ACTIVE (pas d'Activer/Supprimer)", async () => {
    const user = userEvent.setup();
    renderActions(activeSeason);

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(await screen.findByText("Modifier")).toBeInTheDocument();
    expect(screen.queryByText("Activer")).not.toBeInTheDocument();
    expect(screen.queryByText("Supprimer")).not.toBeInTheDocument();
  });

  it("Modifier ouvre la modale d'édition pré-remplie", async () => {
    const user = userEvent.setup();
    renderActions(draftSeason);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Modifier"));

    expect(await screen.findByRole("heading", { name: "Modifier la saison" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de la saison")).toHaveValue("Saison 2026-2027");
  });

  it("Activer (première saison du club) : POST sans oldSeasonEndDate", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ...draftSeason, status: "ACTIVE" }));
    const user = userEvent.setup();
    const onSuccess = renderActions(draftSeason);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Activer"));
    await user.click(await screen.findByRole("button", { name: "Activer la saison" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100/activate",
        expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("Activer (une saison ACTIVE existe déjà) : dialogue pré-rempli, POST avec oldSeasonEndDate", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ...draftSeason, status: "ACTIVE" }));
    const user = userEvent.setup();
    renderActions(draftSeason, { currentActiveSeason: activeSeason });

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Activer"));

    const endDateInput = await screen.findByLabelText("Date de fin de l'ancienne saison");
    expect(endDateInput).toHaveValue("2026-06-30");
    await user.click(screen.getByRole("button", { name: "Activer la saison" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100/activate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ oldSeasonEndDate: "2026-06-30" }),
        }),
      ),
    );
  });

  it("Supprimer après confirmation", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    const user = userEvent.setup();
    const onSuccess = renderActions(draftSeason);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByText("Supprimer"));
    await user.click(await screen.findByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
