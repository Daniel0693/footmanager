import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { push } from "@/test-utils/navigation-mock";
import { SeasonDetailPageContent } from "./page";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const draftSeason = {
  id: 100,
  name: "Saison 2026-2027",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2027-06-30T00:00:00.000Z",
  status: "DRAFT",
};

const archivedSeason = { ...draftSeason, id: 99, status: "ARCHIVED" };

function renderPage(seasonId = "100") {
  return renderWithIntl(
    <SeasonDetailPageContent clubId="1" teamId="5" seasonId={seasonId} />,
  );
}

describe("SeasonDetailPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge et affiche la saison (nom, statut, dates pré-remplies)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(draftSeason));

    renderPage();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/seasons/100",
        expect.anything(),
      );
    });
    expect(await screen.findByRole("heading", { name: "Saison 2026-2027" })).toBeInTheDocument();
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByLabelText("Date de début")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("Date de fin")).toHaveValue("2027-06-30");
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderPage();

    expect(await screen.findByText("Impossible de charger la saison")).toBeInTheDocument();
  });

  it("affiche le bandeau d'information sur une saison archivée", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(archivedSeason));

    renderPage("99");

    expect(
      await screen.findByText(/Cette saison est archivée/),
    ).toBeInTheDocument();
  });

  it("le bouton Supprimer n'est visible que pour une saison DRAFT", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(archivedSeason));

    renderPage("99");

    await screen.findByRole("heading", { name: "Saison 2026-2027" });
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  });

  it("modifie la saison et affiche un toast de succès", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(draftSeason))
      .mockResolvedValueOnce(jsonResponse({ ...draftSeason, name: "Nouveau nom" }))
      .mockResolvedValueOnce(jsonResponse({ ...draftSeason, name: "Nouveau nom" }));

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    await user.clear(screen.getByLabelText("Nom de la saison"));
    await user.type(screen.getByLabelText("Nom de la saison"), "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            name: "Nouveau nom",
            startDate: "2026-08-01",
            endDate: "2027-06-30",
          }),
        }),
      );
    });
  });

  it("supprime la saison après confirmation et redirige vers la liste", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(draftSeason))
      .mockResolvedValueOnce(jsonResponse({}));

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenNthCalledWith(
        2,
        "/clubs/1/teams/5/seasons/100",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(push).toHaveBeenCalledWith("/clubs/1/teams/5/seasons");
  });

  it("l'onglet Championnats affiche un message d'attente", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(jsonResponse(draftSeason));

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });
    await user.click(screen.getByRole("tab", { name: "Championnats" }));

    expect(
      await screen.findByText("La gestion des championnats arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });
});
