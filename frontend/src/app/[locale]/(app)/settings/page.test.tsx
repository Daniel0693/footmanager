import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import SettingsPage from "./page";

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

// Route par URL plutôt que d'enchaîner des mockResolvedValueOnce
// positionnels : la page fait /clubs puis /clubs/:id/members/me en cascade.
function mockApi(clubs: { id: number; name: string }[], membersByClub: Record<number, { birthDate: string | null }>) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url === "/clubs") return Promise.resolve(jsonResponse(clubs));
    const match = /\/clubs\/(\d+)\/members\/me/.exec(url);
    if (match) {
      const clubId = Number(match[1]);
      return Promise.resolve(jsonResponse(membersByClub[clubId] ?? { birthDate: null }));
    }
    return Promise.resolve(jsonResponse(null, false));
  });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("un seul club : pas de sélecteur, pré-remplit la date de naissance", async () => {
    mockApi([{ id: 1, name: "AVF" }], { 1: { birthDate: "2010-07-08T00:00:00.000Z" } });

    renderWithIntl(<SettingsPage />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/members/me",
        expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
      ),
    );
    expect(screen.queryByText("Club")).not.toBeInTheDocument();
    expect(await screen.findByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue(
      "2010-07-08",
    );
  });

  it("plusieurs clubs : affiche un sélecteur, change de club recharge le profil", async () => {
    mockApi(
      [
        { id: 1, name: "AVF" },
        { id: 2, name: "FC Sion" },
      ],
      {
        1: { birthDate: "2010-07-08T00:00:00.000Z" },
        2: { birthDate: null },
      },
    );
    const user = userEvent.setup();

    renderWithIntl(<SettingsPage />);

    expect(await screen.findByText("Club")).toBeInTheDocument();
    expect(await screen.findByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue(
      "2010-07-08",
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "FC Sion" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/2/members/me",
        expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
      ),
    );
    expect(screen.getByLabelText<HTMLInputElement>("Date de naissance")).toHaveValue("");
  });

  it("aucun club : message dédié, pas de formulaire", async () => {
    mockApi([], {});

    renderWithIntl(<SettingsPage />);

    expect(await screen.findByText("Vous n'êtes membre d'aucun club.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Date de naissance")).not.toBeInTheDocument();
  });

  it("soumet la date de naissance via PATCH .../members/me", async () => {
    mockApi([{ id: 1, name: "AVF" }], { 1: { birthDate: null } });
    const user = userEvent.setup();

    renderWithIntl(<SettingsPage />);

    const input = await screen.findByLabelText<HTMLInputElement>("Date de naissance");
    await user.type(input, "1998-05-12");

    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/members/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ birthDate: "1998-05-12" }),
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalled();
  });
});
