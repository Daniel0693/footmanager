import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ChampionshipsPageContent } from "./page";

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

function externalTeamsResponse(data: unknown[], canManage = true) {
  return jsonResponse({ data, canManage });
}

function renderPage(clubId = "1", teamId = "5") {
  return renderWithIntl(<ChampionshipsPageContent clubId={clubId} teamId={teamId} />);
}

describe("ChampionshipsPageContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les équipes adverses de l'équipe courante en transmettant ?teamId=", async () => {
    mockApiFetch.mockResolvedValue(externalTeamsResponse([]));

    renderPage("1", "5");

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.anything(),
      );
    });
  });

  it("affiche l'onglet Championnats par défaut, avec un message d'attente", async () => {
    mockApiFetch.mockResolvedValue(externalTeamsResponse([]));

    renderPage();

    expect(
      await screen.findByText("La gestion des championnats arrivera dans une prochaine phase."),
    ).toBeInTheDocument();
  });

  it("l'onglet Équipes adverses affiche un message si la liste est vide", async () => {
    mockApiFetch.mockResolvedValue(externalTeamsResponse([]));
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));

    expect(await screen.findByText("Aucune équipe adverse pour l'instant")).toBeInTheDocument();
  });

  it("liste les équipes adverses avec ville et pays", async () => {
    mockApiFetch.mockResolvedValue(
      externalTeamsResponse([
        { id: 10, name: "FC Rivaux", city: "Genève", country: "Suisse", notes: null },
      ]),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));

    expect(await screen.findByText("FC Rivaux")).toBeInTheDocument();
    expect(screen.getByText("Genève")).toBeInTheDocument();
    expect(screen.getByText("Suisse")).toBeInTheDocument();
  });

  it("cache le bouton Ajouter et la colonne Actions quand canManage est false", async () => {
    mockApiFetch.mockResolvedValue(
      externalTeamsResponse(
        [{ id: 10, name: "FC Rivaux", city: null, country: null, notes: null }],
        false,
      ),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));
    await screen.findByText("FC Rivaux");

    expect(
      screen.queryByRole("button", { name: "Ajouter une équipe adverse" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
  });

  it("créer une équipe adverse via la modale rafraîchit la liste", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 12 }));
      return Promise.resolve(externalTeamsResponse([]));
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("tab", { name: "Équipes adverses" }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Ajouter une équipe adverse" }));
    await user.type(screen.getByLabelText("Nom"), "FC Rivaux");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.not.objectContaining({ method: "POST" }),
      ),
    );
  });
});
