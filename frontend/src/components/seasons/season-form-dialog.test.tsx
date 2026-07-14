import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingSeason, SeasonFormDialog } from "./season-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

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

const existingSeason: ExistingSeason = {
  id: 100,
  name: "Saison 2026-2027",
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2027-06-30T00:00:00.000Z",
};

describe("SeasonFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : crée une saison club-wide et notifie onSuccess", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 200 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonFormDialog
        clubId="1"
        onSuccess={onSuccess}
        trigger={<Button>Nouvelle saison</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle saison" }));
    expect(await screen.findByRole("heading", { name: "Nouvelle saison" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nom de la saison"), "Saison 2026-2027");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/seasons",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Saison créée avec succès");
    expect(onSuccess).toHaveBeenCalled();
    // La modale se referme après succès (comportement des autres FormDialog).
    expect(screen.queryByRole("heading", { name: "Nouvelle saison" })).not.toBeInTheDocument();
  });

  it("refuse une date de fin antérieure à la date de début, sans appeler l'API", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonFormDialog
        clubId="1"
        onSuccess={jest.fn()}
        trigger={<Button>Nouvelle saison</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle saison" }));
    await user.type(screen.getByLabelText("Nom de la saison"), "Saison invalide");
    await user.type(screen.getByLabelText("Date de début"), "2027-06-30");
    await user.type(screen.getByLabelText("Date de fin"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Créer la saison" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "La date de fin doit être postérieure à la date de début",
      ),
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("mode édition : pré-remplit les champs et envoie un PATCH", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(existingSeason));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonFormDialog
        clubId="1"
        season={existingSeason}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(await screen.findByRole("heading", { name: "Modifier la saison" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom de la saison")).toHaveValue("Saison 2026-2027");
    expect(screen.getByLabelText("Date de début")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("Date de fin")).toHaveValue("2027-06-30");

    await user.clear(screen.getByLabelText("Nom de la saison"));
    await user.type(screen.getByLabelText("Nom de la saison"), "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
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
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Saison mise à jour avec succès");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("affiche une erreur (nom requis) sans appeler l'API si le formulaire est invalide", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonFormDialog
        clubId="1"
        onSuccess={jest.fn()}
        trigger={<Button>Nouvelle saison</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle saison" }));
    await user.click(screen.getByRole("button", { name: "Créer la saison" }));

    expect(await screen.findByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche un toast d'erreur si la création échoue côté API", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const user = userEvent.setup();

    renderWithIntl(
      <SeasonFormDialog
        clubId="1"
        onSuccess={jest.fn()}
        trigger={<Button>Nouvelle saison</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle saison" }));
    await user.type(screen.getByLabelText("Nom de la saison"), "Saison 2026-2027");
    await user.type(screen.getByLabelText("Date de début"), "2026-08-01");
    await user.type(screen.getByLabelText("Date de fin"), "2027-06-30");
    await user.click(screen.getByRole("button", { name: "Créer la saison" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // La modale reste ouverte pour permettre une nouvelle tentative.
    expect(screen.getByRole("heading", { name: "Nouvelle saison" })).toBeInTheDocument();
  });
});
