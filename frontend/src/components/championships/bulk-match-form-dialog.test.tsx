import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { BulkMatchFormDialog } from "./bulk-match-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: jest
    .fn()
    .mockImplementation(async (response: { json: () => Promise<{ code?: string }> }) => {
      const body = await response.json().catch(() => null);
      return body?.code ?? "AUTH.UNKNOWN";
    }),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const participants = [
  { id: 1, internalTeam: { id: 5, name: "U15" }, externalTeam: null },
  { id: 2, internalTeam: null, externalTeam: { id: 50, name: "FC Rivaux" } },
];

async function openDialog() {
  const user = userEvent.setup();
  renderWithIntl(
    <BulkMatchFormDialog
      clubId="1"
      teamId="5"
      championshipId="100"
      onSuccess={jest.fn()}
      trigger={<button type="button">Ajout en masse</button>}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Ajout en masse" }));
  await screen.findByRole("heading", { name: "Ajouter plusieurs rencontres" });
  return user;
}

describe("BulkMatchFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse({ data: participants }));
  });

  it("affiche 3 lignes vides par défaut, avec un bouton pour en ajouter", async () => {
    await openDialog();

    expect(screen.getAllByLabelText("Équipe à domicile")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Ajouter une ligne" })).toBeInTheDocument();
  });

  it("ajoute une ligne supplémentaire au clic", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));

    expect(screen.getAllByLabelText("Équipe à domicile")).toHaveLength(4);
  });

  it("retire une ligne au clic sur son bouton de suppression", async () => {
    const user = await openDialog();

    await user.click(screen.getAllByRole("button", { name: "Retirer la ligne" })[0]);

    expect(screen.getAllByLabelText("Équipe à domicile")).toHaveLength(2);
  });

  it("refuse la création si aucune ligne n'est complète", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Créer les rencontres" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Renseigne au moins une rencontre complète (équipes et date)",
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/bulk"), expect.anything());
  });

  it("envoie une seule requête bulk avec les lignes complétées, ignore les lignes vides", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/bulk")) return Promise.resolve(jsonResponse([{ id: 1 }]));
      return Promise.resolve(jsonResponse({ data: participants }));
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <BulkMatchFormDialog
        clubId="1"
        teamId="5"
        championshipId="100"
        onSuccess={onSuccess}
        trigger={<button type="button">Ajout en masse</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ajout en masse" }));
    await screen.findByRole("heading", { name: "Ajouter plusieurs rencontres" });

    const homeSelects = screen.getAllByLabelText("Équipe à domicile");
    const awaySelects = screen.getAllByLabelText("Équipe à l'extérieur");
    const dateInputs = screen.getAllByLabelText("Date et heure");

    await user.click(homeSelects[0]);
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.click(awaySelects[0]);
    await user.click(await screen.findByRole("option", { name: "FC Rivaux" }));
    await user.type(dateInputs[0], "2026-09-15T14:00");

    await user.click(screen.getByRole("button", { name: "Créer les rencontres" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/championships/100/matches/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            matches: [
              {
                homeParticipantId: 1,
                awayParticipantId: 2,
                scheduledAt: new Date("2026-09-15T14:00").toISOString(),
                round: undefined,
              },
            ],
          }),
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("1 rencontre créée avec succès");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("refuse si une ligne complétée a deux équipes identiques", async () => {
    const user = await openDialog();

    const homeSelects = screen.getAllByLabelText("Équipe à domicile");
    const awaySelects = screen.getAllByLabelText("Équipe à l'extérieur");
    const dateInputs = screen.getAllByLabelText("Date et heure");

    await user.click(homeSelects[0]);
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.click(awaySelects[0]);
    await user.click(await screen.findByRole("option", { name: "U15" }));
    await user.type(dateInputs[0], "2026-09-15T14:00");

    await user.click(screen.getByRole("button", { name: "Créer les rencontres" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Les deux équipes d'une rencontre doivent être différentes",
    );
  });
});
