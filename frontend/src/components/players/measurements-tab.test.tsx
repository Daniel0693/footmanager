import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { MeasurementsTab } from "./measurements-tab";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function measurement(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "HEIGHT",
    value: "140.5",
    date: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

function renderTab(clubId = "1", teamId = "5", playerId = "1") {
  return renderWithIntl(
    <MeasurementsTab clubId={clubId} teamId={teamId} playerId={playerId} />,
  );
}

function queryOf(url: string) {
  return new URL(url, "http://localhost").searchParams;
}

describe("MeasurementsTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("charge le graphique et le tableau séparément, tous deux avec teamId en query", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab("1", "5", "10");

    await screen.findByText("Filtres");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    for (const [url] of mockApiFetch.mock.calls) {
      expect(url).toMatch(/^\/clubs\/1\/players\/10\/measurements\?/);
      expect(queryOf(url).get("teamId")).toBe("5");
    }
  });

  it("le tableau est trié par date décroissante par défaut, le graphique ne demande aucun tri", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();
    await screen.findByText("Filtres");

    const urls = mockApiFetch.mock.calls.map((call) => call[0] as string);
    const tableUrl = urls.find((url) => queryOf(url).get("sortBy"));
    const chartUrl = urls.find((url) => !queryOf(url).get("sortBy"));
    expect(queryOf(tableUrl!).get("sortBy")).toBe("date");
    expect(queryOf(tableUrl!).get("sortOrder")).toBe("desc");
    expect(chartUrl).toBeDefined();
  });

  it("un seul jeu de filtres : changer le type refetch le graphique ET le tableau avec le même filtre", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Filtres");
    mockApiFetch.mockClear();

    await user.click(screen.getByText("Tous les types"));
    await user.click(await screen.findByRole("option", { name: "Taille" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    for (const [url] of mockApiFetch.mock.calls) {
      expect(queryOf(url).get("type")).toBe("HEIGHT");
    }
  });

  it("affiche un état vide pour le graphique et pour le tableau quand il n'y a aucune mesure", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));

    renderTab();

    await waitFor(() =>
      expect(
        screen.getAllByText("Aucune mesure enregistrée pour l'instant"),
      ).toHaveLength(2),
    );
  });

  it("affiche une erreur si le chargement échoue", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));

    renderTab();

    await waitFor(() =>
      expect(screen.getAllByText("Impossible de charger les mesures")).toHaveLength(2),
    );
  });

  it("liste les mesures du tableau avec le bouton Supprimer en rouge (variant destructive)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([measurement()]));

    renderTab();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("140.5")).toBeInTheDocument();
    const deleteButton = table.getByRole("button", { name: "Supprimer" });
    expect(deleteButton.className).toMatch(/destructive/);
  });

  it("cliquer à nouveau sur la colonne Date inverse le tri (desc -> asc) sans changer le filtre du graphique", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([measurement()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("140.5");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: /^Date/ }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("sortBy")).toBe("date");
    expect(queryOf(url).get("sortOrder")).toBe("asc");
  });

  it("cliquer sur la colonne Valeur trie par valeur", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([measurement()]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("140.5");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: /^Valeur/ }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    expect(queryOf(url).get("sortBy")).toBe("value");
  });

  it("le formulaire refuse une soumission sans valeur ni date", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Filtres");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("La valeur est requise")).toBeInTheDocument();
    expect(screen.getByText("La date est requise")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("ajoute une mesure puis rafraîchit le graphique et le tableau", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "POST") return Promise.resolve(jsonResponse(measurement()));
      return Promise.resolve(jsonResponse([]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("Filtres");
    mockApiFetch.mockClear();

    await user.type(screen.getByLabelText("Valeur"), "140.5");
    await user.type(screen.getByLabelText("Date"), "2026-01-15");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/measurements?teamId=5",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "HEIGHT", value: 140.5, date: "2026-01-15" }),
        }),
      ),
    );
    // rafraîchit à la fois le graphique et le tableau après l'ajout.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    expect(toast.success).toHaveBeenCalled();
  });

  it("supprime une mesure et rafraîchit le graphique et le tableau", async () => {
    mockApiFetch.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(jsonResponse({}));
      return Promise.resolve(jsonResponse([measurement()]));
    });
    const user = userEvent.setup();

    renderTab("1", "5", "10");
    await screen.findByText("140.5");
    mockApiFetch.mockClear();

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/players/10/measurements/1?teamId=5",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
  });

  it("cliquer une entrée de légende isole ce type et redéclenche le graphique ET le tableau (filtre partagé)", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse([measurement({ type: "HEIGHT" }), measurement({ id: 2, type: "WEIGHT" })]),
    );
    const user = userEvent.setup();

    renderTab();
    await screen.findByText("Filtres");
    mockApiFetch.mockClear();

    await user.click(await screen.findByRole("button", { name: "Taille" }));

    // La légende pilote le même filtre `type` que le sélecteur du haut :
    // les deux fetchs (graphique + tableau) repartent avec type=HEIGHT.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    for (const [url] of mockApiFetch.mock.calls) {
      expect(queryOf(url).get("type")).toBe("HEIGHT");
    }

    // Le clic déclenche un re-rendu de la légende : on requête à nouveau
    // plutôt que de réutiliser la référence précédente (nœud recréé).
    const heightLegendAfter = await screen.findByRole("button", { name: "Taille" });
    expect(heightLegendAfter).toHaveStyle({ opacity: "1" });
    const weightLegendAfter = await screen.findByRole("button", { name: "Poids" });
    expect(weightLegendAfter).toHaveStyle({ opacity: "0.4" });

    // Re-cliquer la série déjà isolée revient à "Tous les types".
    mockApiFetch.mockClear();
    await user.click(heightLegendAfter);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    for (const [url] of mockApiFetch.mock.calls) {
      expect(queryOf(url).get("type")).toBeNull();
    }
  });
});
