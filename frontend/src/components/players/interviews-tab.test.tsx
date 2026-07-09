import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { InterviewsTab } from "./interviews-tab";

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

function interview(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: "2026-01-15T00:00:00.000Z",
    subject: "Bilan mi-saison",
    summary: "Bonne progression technique",
    staffFeedback: "Continuer sur cette lancée",
    staff: { firstName: "Marie", lastName: "AdminClub" },
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", playerId = "1", isOwnProfile = false) {
  return renderWithIntl(
    <InterviewsTab
      clubId={clubId}
      teamId={teamId}
      playerId={playerId}
      isOwnProfile={isOwnProfile}
    />,
  );
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("InterviewsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge les entretiens avec teamId en query et tri décroissant par défaut", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab("1", "5", "10");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toMatch(/^\/clubs\/1\/players\/10\/interviews\?/);
    expect(queryOf(url).get("teamId")).toBe("5");
    expect(queryOf(url).get("sortOrder")).toBe("desc");
  });

  it("affiche un état vide quand il n'y a aucun entretien", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    expect(
      await screen.findByText("Aucun entretien enregistré pour l'instant"),
    ).toBeInTheDocument();
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    expect(
      await screen.findByText("Impossible de charger les entretiens"),
    ).toBeInTheDocument();
  });

  it("affiche la timeline avec sujet, résumé, retour de l'encadrant et l'auteur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([interview()]));

    renderTab();

    expect(await screen.findByText("Bilan mi-saison")).toBeInTheDocument();
    expect(screen.getByText("Bonne progression technique")).toBeInTheDocument();
    expect(screen.getByText("Continuer sur cette lancée")).toBeInTheDocument();
    expect(screen.getByText(/Réalisé par Marie AdminClub/)).toBeInTheDocument();
  });

  it("n'affiche pas de bloc retour de l'encadrant quand il est absent (entretien planifié)", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([interview({ staffFeedback: null, playerFeedback: null })]),
    );

    renderTab();

    expect(await screen.findByText("Bilan mi-saison")).toBeInTheDocument();
    expect(screen.queryByText("Continuer sur cette lancée")).not.toBeInTheDocument();
  });

  it("affiche le retour du joueur et l'évaluation interne (privée) quand ils sont présents", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([
        interview({
          playerFeedback: "Le joueur se sent prêt",
          staffAssessment: "Ressenti positif",
        }),
      ]),
    );

    renderTab();

    expect(await screen.findByText("Le joueur se sent prêt")).toBeInTheDocument();
    expect(screen.getByText("Ressenti positif")).toBeInTheDocument();
    expect(screen.getByText(/Privé — jamais visible par le joueur/)).toBeInTheDocument();
  });

  it("n'affiche jamais le bloc d'évaluation interne quand staffAssessment est absent de la réponse (cas Player)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([interview()]));

    renderTab();

    await screen.findByText("Bilan mi-saison");
    expect(screen.queryByText(/Privé — jamais visible par le joueur/)).not.toBeInTheDocument();
  });

  it("affiche un badge « Planifié » pour un entretien à venir", async () => {
    const farFutureDate = "2099-01-01T00:00:00.000Z";
    mockApiFetch.mockResolvedValue(jsonResponse([interview({ date: farFutureDate })]));

    renderTab();

    expect(await screen.findByText("Bilan mi-saison")).toBeInTheDocument();
    expect(screen.getByText("Planifié")).toBeInTheDocument();
  });

  it("n'affiche pas de badge « Planifié » pour un entretien passé", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([interview()]));

    renderTab();

    await screen.findByText("Bilan mi-saison");
    expect(screen.queryByText("Planifié")).not.toBeInTheDocument();
  });

  it("changer les filtres de date refetch avec teamId + dateFrom/dateTo", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.type(screen.getByLabelText("Du"), "2026-01-01");

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("dateFrom")).toBe("2026-01-01");
  });

  it("changer le tri refetch avec sortOrder=asc", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Plus récent d'abord"));
    await user.click(await screen.findByRole("option", { name: "Plus ancien d'abord" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("sortOrder")).toBe("asc");
  });

  it("supprime un entretien et rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([interview()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Bilan mi-saison");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/interviews/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ajoute un entretien via le dialogue puis rafraîchit la timeline", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse(interview()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter un entretien" }));
    await user.type(screen.getByLabelText("Date"), "2026-01-15");
    await user.type(screen.getByLabelText("Sujet"), "Bilan mi-saison");
    await user.type(screen.getByLabelText("Résumé de l'entretien"), "Bonne progression");
    await user.type(screen.getByLabelText("Retour de l'encadrant"), "Continuer ainsi");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/interviews?teamId=5",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it("ouvre le dialogue d'édition pré-rempli depuis une entrée de la timeline", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([interview()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Bilan mi-saison");

    await user.click(screen.getByRole("button", { name: "Modifier" }));

    const subjectInput = await screen.findByLabelText<HTMLInputElement>("Sujet");
    expect(subjectInput).toHaveValue("Bilan mi-saison");
  });

  it("isOwnProfile masque le bouton Ajouter et les actions Modifier/Supprimer par ligne (Player n'a que READ/OWN)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([interview()]));

    renderTab("1", "5", "10", true);

    await screen.findByText("Bilan mi-saison");
    expect(screen.queryByRole("button", { name: "Ajouter un entretien" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  });
});
