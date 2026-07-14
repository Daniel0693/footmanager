import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { ParticipantsDialog } from "./participants-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

describe("ParticipantsDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [], canManage: true }));
  });

  it("ouvre une modale de gestion des participants au clic sur le bouton", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ParticipantsDialog clubId="1" teamId="5" championshipId="100" />,
    );

    expect(mockApiFetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Gérer les participants" }));

    expect(await screen.findByText("Aucun participant pour l'instant")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/championships/100/participants",
      expect.anything(),
    );
  });
});
