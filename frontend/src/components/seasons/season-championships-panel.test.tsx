import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { SeasonChampionshipsPanel } from "./season-championships-panel";

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
}));

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: () => Promise.resolve(body) };
}

function renderPanel() {
  return renderWithIntl(<SeasonChampionshipsPanel clubId="1" seasonId="100" />);
}

describe("SeasonChampionshipsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les championnats de la saison au montage", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPanel();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100/championships",
        expect.anything(),
      ),
    );
  });

  it("affiche un message si aucun championnat", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderPanel();

    expect(await screen.findByText("Aucun championnat pour cette saison")).toBeInTheDocument();
  });

  it("liste les championnats avec équipe et dates, chacun lié à sa fiche", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        {
          id: 900,
          name: "Championnat Automne",
          startDate: "2026-09-01T00:00:00.000Z",
          endDate: "2026-12-15T00:00:00.000Z",
          team: { id: 5, name: "U15" },
        },
        {
          id: 901,
          name: "Championnat Printemps",
          startDate: "2027-01-10T00:00:00.000Z",
          endDate: "2027-05-30T00:00:00.000Z",
          team: { id: 5, name: "U15" },
        },
      ]),
    );

    renderPanel();

    const link = await screen.findByRole("link", { name: "Championnat Automne" });
    expect(link).toHaveAttribute("href", "/clubs/1/teams/5/championships/900");
    expect(screen.getByRole("link", { name: "Championnat Printemps" })).toBeInTheDocument();
    expect(screen.getAllByText("U15")).toHaveLength(2);
  });

  it("masque silencieusement le panneau si l'accès est refusé (403)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false, 403));

    renderPanel();

    expect(await screen.findByText("Réservé aux administrateurs du club")).toBeInTheDocument();
    expect(screen.queryByText("Aucun championnat pour cette saison")).not.toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue pour une autre raison", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false, 500));

    renderPanel();

    expect(await screen.findByText("Impossible de charger les championnats")).toBeInTheDocument();
  });
});
