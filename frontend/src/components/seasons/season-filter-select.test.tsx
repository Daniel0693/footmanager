import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonFilterSelect } from "./season-filter-select";

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

function renderSelect(onSeasonChange = jest.fn()) {
  return {
    onSeasonChange,
    ...renderWithIntl(
      <SeasonFilterSelect clubId="1" teamId="5" onSeasonChange={onSeasonChange} />,
    ),
  };
}

describe("SeasonFilterSelect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les saisons de l'équipe et sélectionne la saison ACTIVE par défaut", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        { id: 10, name: "Saison 2026-2027", status: "ACTIVE" },
        { id: 9, name: "Saison 2025-2026", status: "ARCHIVED" },
      ]),
    );
    const onSeasonChange = jest.fn();

    renderSelect(onSeasonChange);

    await waitFor(() => expect(onSeasonChange).toHaveBeenCalledWith(10));
    expect(await screen.findByText("Saison 2026-2027")).toBeInTheDocument();
  });

  it("bascule sur « Période personnalisée » quand aucune saison ACTIVE n'existe", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([{ id: 9, name: "Saison 2025-2026", status: "ARCHIVED" }]),
    );
    const onSeasonChange = jest.fn();

    renderSelect(onSeasonChange);

    expect(await screen.findByText("Période personnalisée")).toBeInTheDocument();
    expect(onSeasonChange).not.toHaveBeenCalled();
  });

  it("sélectionner « Période personnalisée » notifie onSeasonChange(null)", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([{ id: 10, name: "Saison 2026-2027", status: "ACTIVE" }]),
    );
    const onSeasonChange = jest.fn();
    const user = userEvent.setup();

    renderSelect(onSeasonChange);
    await waitFor(() => expect(onSeasonChange).toHaveBeenCalledWith(10));
    onSeasonChange.mockClear();

    await user.click(screen.getByText("Saison 2026-2027"));
    await user.click(await screen.findByRole("option", { name: "Période personnalisée" }));

    expect(onSeasonChange).toHaveBeenCalledWith(null);
  });

  it("affiche une erreur si le chargement des saisons échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderSelect();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Impossible de charger les saisons"),
    );
  });
});
