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

// Résolution du teamId (pour `?teamId=`, requis par PermissionsGuard pour un
// Coach/Player en scope TEAM — voir seasons.controller.ts) testée séparément
// dans ses propres appelants ; mockée ici en valeur fixe.
jest.mock("@/lib/resolve-any-team", () => ({
  resolveAnyTeamId: jest.fn(() => Promise.resolve("5")),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: () => Promise.resolve(body) };
}

const draftSeason = {
  id: 100,
  name: "Saison 2026-2027",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2027-06-30T00:00:00.000Z",
  status: "DRAFT",
  canManage: true,
};

const archivedSeason = { ...draftSeason, id: 99, status: "ARCHIVED" };

// Mock par défaut : ne renvoie aucune saison ACTIVE du club (première
// saison) et aucun championnat pour cette saison — utilisé par les tests
// qui ne portent pas sur l'activation ou les championnats.
function mockApiFetchDefault(season: unknown, ok = true) {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
    if (url.includes("/championships")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse(season, ok));
  });
}

function renderPage(seasonId = "100") {
  return renderWithIntl(<SeasonDetailPageContent clubId="1" seasonId={seasonId} />);
}

describe("SeasonDetailPage (club-wide, révision A14-A17)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token", user: { id: 1 } });
  });

  it("charge et affiche la saison (nom, statut, dates), en transmettant ?teamId=", async () => {
    mockApiFetchDefault(draftSeason);

    renderPage();

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100?teamId=5",
        expect.anything(),
      );
    });
    expect(await screen.findByRole("heading", { name: "Saison 2026-2027" })).toBeInTheDocument();
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByText("01/08/2026")).toBeInTheDocument();
    expect(screen.getByText("30/06/2027")).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetchDefault(null, false);

    renderPage();

    expect(await screen.findByText("Impossible de charger la saison")).toBeInTheDocument();
  });

  it("affiche le bandeau d'information sur une saison archivée", async () => {
    mockApiFetchDefault(archivedSeason);

    renderPage("99");

    expect(
      await screen.findByText(/Cette saison est archivée/),
    ).toBeInTheDocument();
  });

  it("les boutons Activer et Supprimer ne sont visibles que pour une saison DRAFT", async () => {
    mockApiFetchDefault(archivedSeason);

    renderPage("99");

    await screen.findByRole("heading", { name: "Saison 2026-2027" });
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activer" })).not.toBeInTheDocument();
  });

  it("cache Activer/Supprimer/Modifier quand canManage est false (Coach/Player en lecture seule)", async () => {
    mockApiFetchDefault({ ...draftSeason, canManage: false });

    renderPage();

    await screen.findByRole("heading", { name: "Saison 2026-2027" });
    expect(screen.queryByRole("button", { name: "Activer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
  });

  it("modifie la saison via la modale Modifier (pas de formulaire inline sur la page)", async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/championships")) return Promise.resolve(jsonResponse([]));
      if (options?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ ...draftSeason, name: "Nouveau nom" }));
      }
      return Promise.resolve(jsonResponse(draftSeason));
    });

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(await screen.findByRole("heading", { name: "Modifier la saison" })).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Nom de la saison"));
    await user.type(screen.getByLabelText("Nom de la saison"), "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100",
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
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/championships")) return Promise.resolve(jsonResponse([]));
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse(draftSeason));
    });

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Supprimer définitivement" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons/100",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(push).toHaveBeenCalledWith("/clubs/1/seasons");
  });

  it("affiche directement les dates et les championnats de la saison, sans onglets", async () => {
    mockApiFetchDefault(draftSeason);

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    expect(await screen.findByText("Aucun championnat pour cette saison")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("liste les championnats de la saison, tous équipes confondues, avec un lien vers chacun", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/championships")) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 900,
              name: "Championnat Automne",
              startDate: "2026-09-01T00:00:00.000Z",
              endDate: "2026-12-15T00:00:00.000Z",
              team: { id: 5, name: "U15" },
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse(draftSeason));
    });

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    const link = await screen.findByRole("link", { name: "Championnat Automne" });
    expect(link).toHaveAttribute("href", "/clubs/1/teams/5/championships/900");
    expect(screen.getByText("U15")).toBeInTheDocument();
  });

  it("masque silencieusement le panneau des championnats si l'accès est refusé (403, Coach/Player)", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
      if (url.includes("/championships")) return Promise.resolve(jsonResponse(null, false, 403));
      return Promise.resolve(jsonResponse(draftSeason));
    });

    renderPage();
    await screen.findByRole("heading", { name: "Saison 2026-2027" });

    expect(await screen.findByText("Réservé aux administrateurs du club")).toBeInTheDocument();
    expect(screen.queryByText("Aucun championnat pour cette saison")).not.toBeInTheDocument();
  });

  describe("activation (révision A14-A17 — plus de wizard, action ponctuelle)", () => {
    it("première saison du club (aucune ACTIVE existante) : dialogue simplifié, POST sans oldSeasonEndDate", async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes("status=ACTIVE")) return Promise.resolve(jsonResponse({ data: [] }));
        if (url.includes("/championships")) return Promise.resolve(jsonResponse([]));
        if (options?.method === "POST") return Promise.resolve(jsonResponse({ ...draftSeason, status: "ACTIVE" }));
        return Promise.resolve(jsonResponse(draftSeason));
      });

      renderPage();
      await screen.findByRole("heading", { name: "Saison 2026-2027" });

      await user.click(screen.getByRole("button", { name: "Activer" }));
      expect(
        await screen.findByText(/première saison active du club/i),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Activer la saison" }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/clubs/1/seasons/100/activate",
          expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
        ),
      );
    });

    it("une saison ACTIVE existe déjà : dialogue pré-rempli avec sa endDate, POST avec oldSeasonEndDate corrigée", async () => {
      const user = userEvent.setup();
      const currentActive = {
        id: 50,
        name: "Saison 2025-2026",
        startDate: "2025-08-01T00:00:00.000Z",
        endDate: "2026-06-30T00:00:00.000Z",
        status: "ACTIVE",
        canManage: true,
      };
      mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes("status=ACTIVE"))
          return Promise.resolve(jsonResponse({ data: [currentActive] }));
        if (url.includes("/championships")) return Promise.resolve(jsonResponse([]));
        if (options?.method === "POST") return Promise.resolve(jsonResponse({ ...draftSeason, status: "ACTIVE" }));
        return Promise.resolve(jsonResponse(draftSeason));
      });

      renderPage();
      await screen.findByRole("heading", { name: "Saison 2026-2027" });

      await user.click(screen.getByRole("button", { name: "Activer" }));
      expect(await screen.findByText(/Saison 2025-2026/)).toBeInTheDocument();
      const endDateInput = await screen.findByLabelText("Date de fin de l'ancienne saison");
      expect(endDateInput).toHaveValue("2026-06-30");

      await user.clear(endDateInput);
      await user.type(endDateInput, "2026-07-15");
      await user.click(screen.getByRole("button", { name: "Activer la saison" }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/clubs/1/seasons/100/activate",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ oldSeasonEndDate: "2026-07-15" }),
          }),
        ),
      );
    });
  });
});
