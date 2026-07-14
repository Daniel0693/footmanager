import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { ExistingExternalTeam, ExternalTeamFormDialog } from "./external-team-form-dialog";

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

const existingExternalTeam: ExistingExternalTeam = {
  id: 100,
  name: "FC Rivaux",
  city: "Genève",
  country: "Suisse",
  notes: null,
};

describe("ExternalTeamFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : crée une équipe adverse en transmettant ?teamId= et notifie onSuccess", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 200 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ExternalTeamFormDialog
        clubId="1"
        teamId="5"
        onSuccess={onSuccess}
        trigger={<Button>Nouvelle équipe adverse</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle équipe adverse" }));
    expect(
      await screen.findByRole("heading", { name: "Nouvelle équipe adverse" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nom"), "FC Rivaux");
    await user.type(screen.getByLabelText("Ville"), "Genève");
    await user.type(screen.getByLabelText("Pays"), "Suisse");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams?teamId=5",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "FC Rivaux", city: "Genève", country: "Suisse" }),
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Équipe adverse créée avec succès");
    expect(onSuccess).toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Nouvelle équipe adverse" }),
    ).not.toBeInTheDocument();
  });

  it("mode édition : pré-remplit les champs et envoie un PATCH avec ?teamId=", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(existingExternalTeam));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <ExternalTeamFormDialog
        clubId="1"
        teamId="5"
        externalTeam={existingExternalTeam}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(
      await screen.findByRole("heading", { name: "Modifier l'équipe adverse" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("FC Rivaux");
    expect(screen.getByLabelText("Ville")).toHaveValue("Genève");

    await user.clear(screen.getByLabelText("Nom"));
    await user.type(screen.getByLabelText("Nom"), "Nouveau nom");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/external-teams/100?teamId=5",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Nouveau nom", city: "Genève", country: "Suisse" }),
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Équipe adverse mise à jour avec succès");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("affiche une erreur (nom requis) sans appeler l'API si le formulaire est invalide", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ExternalTeamFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Nouvelle équipe adverse</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle équipe adverse" }));
    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText("Le nom est requis")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche un toast d'erreur si la création échoue côté API", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const user = userEvent.setup();

    renderWithIntl(
      <ExternalTeamFormDialog
        clubId="1"
        teamId="5"
        onSuccess={jest.fn()}
        trigger={<Button>Nouvelle équipe adverse</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Nouvelle équipe adverse" }));
    await user.type(screen.getByLabelText("Nom"), "FC Rivaux");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "Nouvelle équipe adverse" }),
    ).toBeInTheDocument();
  });
});
