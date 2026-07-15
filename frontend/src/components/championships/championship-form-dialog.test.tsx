import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { push } from "@/test-utils/navigation-mock";
import {
  ChampionshipFormDialog,
  ExistingChampionship,
} from "./championship-form-dialog";

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
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const seasonsResponse = jsonResponse({
  data: [
    { id: 20, name: "Saison 2026-2027" },
    { id: 19, name: "Saison 2025-2026" },
  ],
});

const existingChampionship: ExistingChampionship = {
  id: 100,
  seasonId: 20,
  name: "Championnat Automne",
  startDate: "2026-09-01T00:00:00.000Z",
  endDate: "2026-12-15T00:00:00.000Z",
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  tiebreakerRules: ["GOAL_DIFFERENCE", "GOALS_SCORED"],
  tiebreakerPreset: "SIMPLE",
  numberOfPeriods: 2,
  periodDurationMinutes: 45,
};

describe("ChampionshipFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(seasonsResponse);
  });

  it("mode création : charge les saisons (?teamId=), préremplit le preset Standard UEFA, crée le championnat", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 200 }));
      return Promise.resolve(seasonsResponse);
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        onSuccess={onSuccess}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    expect(
      await screen.findByRole("heading", { name: "Nouveau championnat" }),
    ).toBeInTheDocument();

    expect(mockApiFetch).toHaveBeenCalledWith("/clubs/1/seasons?teamId=5", expect.anything());
    // Preset par défaut : Standard UEFA, avec ses 4 règles préremplies.
    expect(screen.getByText("1. Différence de buts générale")).toBeInTheDocument();
    expect(screen.getByText("2. Buts marqués")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nom"), "Championnat Automne");
    await user.click(screen.getByLabelText("Saison"));
    await user.click(await screen.findByRole("option", { name: "Saison 2026-2027" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-09-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Championnat créé avec succès");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("mode édition : pré-remplit les champs et le preset existant, envoie un PATCH", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") return Promise.resolve(jsonResponse(existingChampionship));
      return Promise.resolve(seasonsResponse);
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        championship={existingChampionship}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(
      await screen.findByRole("heading", { name: "Modifier le championnat" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Championnat Automne");
    // Preset "Simple" (existant) préremplit ses 2 règles, pas les 4 du défaut.
    expect(screen.getByText("1. Différence de buts générale")).toBeInTheDocument();
    expect(screen.getByText("2. Buts marqués")).toBeInTheDocument();
    expect(screen.queryByText(/Points en confrontation directe/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Nom"));
    await user.type(screen.getByLabelText("Nom"), "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Championnat mis à jour avec succès");
  });

  it("réordonne les règles de départage via Monter/Descendre", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    await screen.findByText("1. Différence de buts générale");

    const moveDownButtons = screen.getAllByRole("button", { name: "Descendre" });
    await user.click(moveDownButtons[0]);

    expect(screen.getByText("1. Buts marqués")).toBeInTheDocument();
    expect(screen.getByText("2. Différence de buts générale")).toBeInTheDocument();
  });

  it("retirer toutes les règles affiche une erreur de validation et bloque la soumission", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    await screen.findByText("1. Différence de buts générale");

    const initialCount = screen.getAllByRole("button", { name: "Retirer" }).length;
    for (let i = 0; i < initialCount; i += 1) {
      await user.click(screen.getAllByRole("button", { name: "Retirer" })[0]);
    }

    await user.type(screen.getByLabelText("Nom"), "Championnat Automne");
    await user.click(screen.getByLabelText("Saison"));
    await user.click(await screen.findByRole("option", { name: "Saison 2026-2027" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-09-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Au moins une règle de départage est requise",
      ),
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/clubs/1/teams/5/championships",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("createScope=CLUB : sélecteur d'équipe (pas de club), poste sur l'équipe choisie et redirige vers la fiche créée", async () => {
    const teams = [
      { id: 5, name: "U15" },
      { id: 8, name: "Seniors" },
    ];
    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 300 }));
      if (url.includes("/teams")) return Promise.resolve(jsonResponse(teams));
      return Promise.resolve(seasonsResponse);
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        createScope="CLUB"
        onSuccess={onSuccess}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    await screen.findByRole("heading", { name: "Nouveau championnat" });

    expect(screen.queryByLabelText("Club")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Équipe")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nom"), "Championnat Automne");
    await user.click(screen.getByLabelText("Saison"));
    await user.click(await screen.findByRole("option", { name: "Saison 2026-2027" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-09-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-12-15");
    await user.click(screen.getByLabelText("Équipe"));
    await user.click(await screen.findByRole("option", { name: "Seniors" }));
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/8/championships",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/clubs/1/teams/8/championships/300");
  });

  it("createScope=ALL : sélecteurs club et équipe, changer de club recharge équipes et saisons, redirige vers la fiche créée", async () => {
    const clubs = [
      { id: 1, name: "Club A" },
      { id: 2, name: "Club B" },
    ];
    const teamsClub2 = [{ id: 12, name: "U10" }];
    const seasonsClub2 = jsonResponse({ data: [{ id: 30, name: "Saison Club B" }] });

    mockApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse({ id: 400 }));
      if (url === "/clubs") return Promise.resolve(jsonResponse(clubs));
      if (url.includes("/clubs/2/teams")) return Promise.resolve(jsonResponse(teamsClub2));
      if (url.includes("/clubs/2/seasons")) return Promise.resolve(seasonsClub2);
      if (url.includes("/teams")) return Promise.resolve(jsonResponse([{ id: 5, name: "U15" }]));
      return Promise.resolve(seasonsResponse);
    });
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        createScope="ALL"
        onSuccess={jest.fn()}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    await screen.findByRole("heading", { name: "Nouveau championnat" });

    await user.click(screen.getByLabelText("Club"));
    await user.click(await screen.findByRole("option", { name: "Club B" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/clubs/2/teams", expect.anything()),
    );
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/2/seasons?teamId=5",
        expect.anything(),
      ),
    );

    await user.type(screen.getByLabelText("Nom"), "Championnat Automne");
    await user.click(screen.getByLabelText("Équipe"));
    await user.click(await screen.findByRole("option", { name: "U10" }));
    await user.click(screen.getByLabelText("Saison"));
    await user.click(await screen.findByRole("option", { name: "Saison Club B" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-09-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/2/teams/12/championships",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/clubs/2/teams/12/championships/400");
  });

  it("createScope=ALL : bloque la soumission si aucune équipe n'est sélectionnée après un changement de club", async () => {
    const clubs = [
      { id: 1, name: "Club A" },
      { id: 2, name: "Club B" },
    ];
    mockApiFetch.mockImplementation((url: string) => {
      if (url === "/clubs") return Promise.resolve(jsonResponse(clubs));
      if (url.includes("/clubs/2/teams")) return Promise.resolve(jsonResponse([{ id: 12, name: "U10" }]));
      if (url.includes("/teams")) return Promise.resolve(jsonResponse([{ id: 5, name: "U15" }]));
      return Promise.resolve(seasonsResponse);
    });
    const user = userEvent.setup();

    renderWithIntl(
      <ChampionshipFormDialog
        clubId="1"
        teamId="5"
        createScope="ALL"
        onSuccess={jest.fn()}
        trigger={<Button>Nouveau championnat</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouveau championnat" }));
    await screen.findByRole("heading", { name: "Nouveau championnat" });

    await user.click(screen.getByLabelText("Club"));
    await user.click(await screen.findByRole("option", { name: "Club B" }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/clubs/2/teams", expect.anything()),
    );

    await user.type(screen.getByLabelText("Nom"), "Championnat Automne");
    await user.click(screen.getByLabelText("Saison"));
    await user.click(await screen.findByRole("option", { name: "Saison 2026-2027" }));
    await user.type(screen.getByLabelText("Date de début"), "2026-09-01");
    await user.type(screen.getByLabelText("Date de fin"), "2026-12-15");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(toast.error).toHaveBeenCalledWith("L'équipe est requise");
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/championships"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
