import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { EventFormDialog, type ExistingEvent } from "./event-form-dialog";

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

const teams = [
  { id: 5, name: "U15 A" },
  { id: 8, name: "Seniors" },
];

const existingEvent: ExistingEvent = {
  id: 42,
  type: "MATCH",
  title: "Match amical",
  startAt: "2026-07-10T18:00:00.000Z",
  endAt: "2026-07-10T19:30:00.000Z",
  location: "Stade municipal",
  description: "Contre l'équipe voisine",
  team: { id: 8, name: "Seniors" },
};

describe("EventFormDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("mode création : équipe et type par défaut, titre et date de début requis", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes).toHaveLength(2);
    expect(comboboxes[0]).toHaveTextContent("U15 A");
    expect(comboboxes[1]).toHaveTextContent("Entraînement");

    await user.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText("Le titre est requis")).toBeInTheDocument();
    expect(await screen.findByText("La date de début est requise")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("mode création : POST vers l'équipe sélectionnée avec le corps attendu", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 99 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.type(screen.getByLabelText("Titre"), "Entraînement technique");
    await user.type(screen.getByLabelText("Début"), "2026-07-10T18:00");
    await user.type(screen.getByLabelText("Lieu"), "Stade municipal");

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    await user.click(await screen.findByRole("option", { name: "Seniors" }));

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      type: "TRAINING",
      title: "Entraînement technique",
      location: "Stade municipal",
    });
    expect(body.startAt).toBe(new Date("2026-07-10T18:00").toISOString());
    expect(body.endAt).toBeUndefined();
    expect(toast.success).toHaveBeenCalled();
  });

  it("une seule équipe accessible : pas de sélecteur, POST envoyé vers cette équipe", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 99 }));
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={[teams[0]]}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    expect(screen.getAllByRole("combobox")).toHaveLength(1); // uniquement le type
    await user.type(screen.getByLabelText("Titre"), "Match amical");
    await user.type(screen.getByLabelText("Début"), "2026-07-10T18:00");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/events",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("mode édition : pré-remplit le formulaire, équipe affichée en lecture seule, envoie un PATCH", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 42 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingEvent}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByText("Seniors")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>("Titre")).toHaveValue("Match amical");
    expect(screen.getByLabelText("Lieu")).toHaveValue("Stade municipal");
    expect(screen.getAllByRole("combobox")).toHaveLength(1); // pas de sélecteur d'équipe

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events/42",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("affiche l'erreur traduite renvoyée par le backend en cas d'échec", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null, false));
    const parseErrorCode = jest.requireMock("@/lib/api").parseErrorCode as jest.Mock;
    parseErrorCode.mockResolvedValueOnce("EVENTS.TEAM_NOT_IN_CLUB");
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        onSuccess={jest.fn()}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.type(screen.getByLabelText("Titre"), "Entraînement");
    await user.type(screen.getByLabelText("Début"), "2026-07-10T18:00");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cette équipe n'appartient pas à ce club"),
    );
  });
});
