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
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
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
  isRecurring: false,
  team: { id: 8, name: "Seniors" },
};

const existingRecurringEvent: ExistingEvent = {
  ...existingEvent,
  id: 43,
  title: "Entraînement hebdomadaire",
  isRecurring: true,
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
      "/clubs/1/teams/8/events/42?scope=single",
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

  it("case Événement récurrent : affiche les champs de récurrence et masque Début/Fin normaux", async () => {
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
    expect(screen.getByLabelText("Début")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Événement récurrent" }));

    expect(screen.queryByLabelText("Début")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Heure de début")).toBeInTheDocument();
    expect(screen.getByText("Type de récurrence")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "lun." })).toBeInTheDocument();
  });

  it("mode édition : pas de case Événement récurrent", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingEvent}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.queryByRole("checkbox", { name: "Événement récurrent" })).not.toBeInTheDocument();
  });

  it("mode édition d'un événement récurrent : demande le périmètre avant d'envoyer le PATCH", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingRecurringEvent}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Modifier l'événement récurrent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cet événement et les suivants" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events/43?scope=future",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("mode édition d'un événement récurrent : \"cet événement seulement\" envoie scope=single", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingRecurringEvent}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Cet événement seulement" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events/43?scope=single",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("mode édition : bouton Supprimer disponible, confirme puis envoie un DELETE", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null));
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
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events/42?scope=single",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("mode édition d'un événement récurrent : bouton Supprimer propose aussi le choix single/future", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(null));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingRecurringEvent}
        onSuccess={onSuccess}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Cet événement et les suivants" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/8/events/43?scope=future",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("mode édition d'un événement récurrent : Annuler referme le choix sans requête réseau", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingRecurringEvent}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Modifier l'événement récurrent")).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("récurrence hebdomadaire : crée une occurrence par jour sélectionné via l'endpoint bulk", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ count: 3 }));
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={[teams[0]]}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.type(screen.getByLabelText("Titre"), "Entraînement");
    await user.click(screen.getByRole("checkbox", { name: "Événement récurrent" }));

    await user.type(screen.getByLabelText("Heure de début"), "17:30");
    await user.type(screen.getByLabelText("Heure de fin"), "19:00");
    await user.click(screen.getByRole("checkbox", { name: "lun." }));
    await user.click(screen.getByRole("checkbox", { name: "mer." }));
    await user.click(screen.getByRole("checkbox", { name: "ven." }));
    await user.type(screen.getByLabelText("Début de la récurrence"), "2026-07-06");
    await user.type(screen.getByLabelText("Fin de la récurrence"), "2026-07-12");
    await user.type(screen.getByLabelText("Lieu"), "Ecossia");

    expect(await screen.findByText("3 événements seront créés")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/events/bulk",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string) as {
      events: { title: string; location: string; startAt: string; endAt: string }[];
    };
    expect(body.events).toHaveLength(3);
    expect(body.events[0]).toMatchObject({ title: "Entraînement", location: "Ecossia" });
    expect(body.events[0].startAt).toBe(new Date(2026, 6, 6, 17, 30).toISOString());
    expect(body.events[0].endAt).toBe(new Date(2026, 6, 6, 19, 0).toISOString());
    expect(body.events[1].startAt).toBe(new Date(2026, 6, 8, 17, 30).toISOString());
    expect(body.events[2].startAt).toBe(new Date(2026, 6, 10, 17, 30).toISOString());
    expect(toast.success).toHaveBeenCalled();
  });

  it("sélection du type Match : affiche le sous-formulaire, masque la récurrence", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ data: [{ id: 20, name: "FC Rivals" }] }));
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
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Match" }));

    expect(screen.queryByRole("checkbox", { name: "Événement récurrent" })).not.toBeInTheDocument();
    expect(await screen.findByText("Type de match")).toBeInTheDocument();
    expect(screen.getByText("Domicile / Extérieur")).toBeInTheDocument();
    expect(screen.getByText("Adversaire")).toBeInTheDocument();
    // Coupe pas sélectionné par défaut (Amical) : pas de champ phase.
    expect(screen.queryByText("Phase de la coupe")).not.toBeInTheDocument();
  });

  it("création d'un match Coupe : POST vers /matches, titre auto-rempli depuis l'adversaire, cupRound inclus", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("external-teams")) {
        return Promise.resolve(jsonResponse({ data: [{ id: 20, name: "FC Rivals" }] }));
      }
      return Promise.resolve(jsonResponse({ id: 900 }));
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={[teams[0]]}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Match" }));
    await user.type(screen.getByLabelText("Début"), "2026-10-01T18:00");

    // Comboboxes une fois le sous-formulaire affiché (matchType par défaut
    // AMICAL, pas de Phase de la coupe) :
    // [Type, matchType, homeOrAway, gameFormat, adversaire].
    let comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes).toHaveLength(5);
    await user.click(comboboxes[1]); // Type de match
    await user.click(await screen.findByRole("option", { name: "Coupe" }));

    // Phase de la coupe apparaît en 5e position (COUPE sélectionné) :
    // [Type, matchType, homeOrAway, gameFormat, cupRound, adversaire].
    comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes).toHaveLength(6);
    await user.click(comboboxes[4]);
    await user.click(await screen.findByRole("option", { name: "8e de finale" }));

    comboboxes = await screen.findAllByRole("combobox");
    await user.click(comboboxes[5]); // Adversaire
    await user.click(await screen.findByRole("option", { name: "FC Rivals" }));

    // Titre auto-rempli depuis l'adversaire choisi (jamais tapé manuellement).
    expect(screen.getByLabelText<HTMLInputElement>("Titre")).toHaveValue("FC Rivals");

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const matchCall = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/matches"));
    expect(matchCall).toBeDefined();
    const [url, options] = matchCall!;
    expect(url).toBe("/clubs/1/teams/5/matches");
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({
      title: "FC Rivals",
      matchType: "COUPE",
      opponentExternalTeamId: 20,
      cupRound: "ROUND_OF_16",
      homeOrAway: "HOME",
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("création d'un match Amical : cupRound absent du corps envoyé", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("external-teams")) {
        return Promise.resolve(jsonResponse({ data: [{ id: 20, name: "FC Rivals" }] }));
      }
      return Promise.resolve(jsonResponse({ id: 900 }));
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={[teams[0]]}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Match" }));
    await user.type(screen.getByLabelText("Titre"), "Amical vs FC Rivals");
    await user.type(screen.getByLabelText("Début"), "2026-10-01T18:00");

    // [Type, matchType, homeOrAway, gameFormat, adversaire] — Amical par
    // défaut, pas de champ Phase de la coupe.
    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes).toHaveLength(5);
    await user.click(comboboxes[4]);
    await user.click(await screen.findByRole("option", { name: "FC Rivals" }));

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const matchCall = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/matches"));
    const [, options] = matchCall!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toMatchObject({ matchType: "AMICAL", opponentExternalTeamId: 20 });
    expect(body.cupRound).toBeUndefined();
  });

  it("création d'un match : le format de jeu est préempli depuis la catégorie de l'équipe (U13 → 9 vs 9)", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("external-teams")) {
        return Promise.resolve(jsonResponse({ data: [{ id: 20, name: "FC Rivals" }] }));
      }
      return Promise.resolve(jsonResponse({ id: 900 }));
    });
    const onSuccess = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={[{ id: 5, name: "U13 A", category: "U13" }]}
        onSuccess={onSuccess}
        trigger={<Button>Ajouter un événement</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ajouter un événement" }));
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Match" }));
    await user.type(screen.getByLabelText("Titre"), "Amical vs FC Rivals");
    await user.type(screen.getByLabelText("Début"), "2026-10-01T18:00");

    const comboboxes = await screen.findAllByRole("combobox");
    expect(comboboxes[3]).toHaveTextContent("9 vs 9");
    await user.click(comboboxes[4]);
    await user.click(await screen.findByRole("option", { name: "FC Rivals" }));

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const matchCall = mockApiFetch.mock.calls.find(([url]) => (url as string).endsWith("/matches"));
    const [, options] = matchCall!;
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.gameFormat).toBe("NINE");
  });

  it("mode édition : Match n'est plus proposé comme type sélectionnable", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <EventFormDialog
        clubId="1"
        teams={teams}
        event={existingEvent}
        onSuccess={jest.fn()}
        trigger={<Button>Modifier</Button>}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Modifier" }));
    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option", { name: "Match" })).not.toBeInTheDocument();
  });

  it("récurrence hebdomadaire sans jour sélectionné : erreur de validation, aucun appel réseau", async () => {
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
    await user.type(screen.getByLabelText("Titre"), "Entraînement");
    await user.click(screen.getByRole("checkbox", { name: "Événement récurrent" }));
    await user.type(screen.getByLabelText("Heure de début"), "17:30");
    await user.type(screen.getByLabelText("Début de la récurrence"), "2026-07-06");
    await user.type(screen.getByLabelText("Fin de la récurrence"), "2026-07-12");

    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(
      await screen.findByText("Sélectionnez au moins un jour de la semaine"),
    ).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
