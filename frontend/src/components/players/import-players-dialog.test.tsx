import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { ImportPlayersDialog } from "./import-players-dialog";

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
const mockParseErrorCode = jest.fn().mockResolvedValue("AUTH.UNKNOWN");
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  authHeaders: (token: string | null) => ({ Authorization: `Bearer ${token}` }),
  parseErrorCode: (...args: unknown[]) => mockParseErrorCode(...args),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

function renderDialog(onSuccess = jest.fn()) {
  renderWithIntl(
    <ImportPlayersDialog
      clubId="1"
      teamId="5"
      onSuccess={onSuccess}
      trigger={<Button>Importer un fichier</Button>}
    />,
  );
  return onSuccess;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Importer un fichier" }));
  await screen.findByLabelText("Choisir un fichier");
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(["contenu"], "joueurs.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await user.upload(screen.getByLabelText("Choisir un fichier"), file);
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  comboboxName: string,
  optionName: string,
) {
  await user.click(screen.getByRole("combobox", { name: comboboxName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

// Un fichier détecté avec deux colonnes reconnues automatiquement (Prénom,
// Nom) et une troisième non reconnue, pour exercer à la fois le pré-remplissage
// heuristique et la sélection manuelle.
const parsedFile = {
  headers: ["Prénom", "Nom", "Colonne Inconnue"],
  rows: [["Karim", "Benali", "xyz"]],
};

const parsedFileTwoRows = {
  headers: ["Prénom", "Nom"],
  rows: [
    ["Karim", "Benali"],
    ["Zoe", "Martin"],
  ],
};

async function goToMappingStep(
  user: ReturnType<typeof userEvent.setup>,
  file: { headers: string[]; rows: string[][] } = parsedFile,
) {
  mockApiFetch.mockResolvedValueOnce(jsonResponse(file));
  await openDialog(user);
  await chooseFile(user);
  await user.click(screen.getByRole("button", { name: "Analyser le fichier" }));
  await screen.findByRole("combobox", { name: "Prénom" });
}

async function goToPreviewStep(
  user: ReturnType<typeof userEvent.setup>,
  previewResponse: unknown,
) {
  await goToMappingStep(user);
  mockApiFetch.mockResolvedValueOnce(jsonResponse(previewResponse));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await screen.findByText("Karim Benali");
}

describe("ImportPlayersDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
  });

  it("le bouton Analyser est désactivé tant qu'aucun fichier n'est choisi", async () => {
    const user = userEvent.setup();
    renderDialog();
    await openDialog(user);

    expect(screen.getByRole("button", { name: "Analyser le fichier" })).toBeDisabled();

    await chooseFile(user);

    expect(screen.getByRole("button", { name: "Analyser le fichier" })).toBeEnabled();
  });

  it("l'analyse du fichier envoie un FormData et passe à l'étape de mapping avec un pré-remplissage heuristique", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToMappingStep(user);

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/clubs/1/teams/5/roster/import/parse",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[0];
    expect((options as RequestInit).body).toBeInstanceOf(FormData);

    // "Prénom" et "Nom" sont reconnus automatiquement (alias PRENOM/NOM).
    expect(
      within(screen.getByRole("combobox", { name: "Prénom" })).getByText("Prénom"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("combobox", { name: "Nom" })).getByText("Nom"),
    ).toBeInTheDocument();
    // La troisième colonne n'a pas d'alias connu : reste ignorée.
    expect(
      within(screen.getByRole("combobox", { name: "Colonne Inconnue" })).getByText(
        "Ignorer cette colonne",
      ),
    ).toBeInTheDocument();
  });

  it("associer un champ déjà pris à une autre colonne libère l'ancienne colonne (Ignorer)", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToMappingStep(user);

    // Prénom est déjà mappé (heuristique) : associer aussi ce champ à la
    // troisième colonne doit remettre la première colonne à "Ignorer" (pas
    // deux colonnes pour un même champ).
    await selectOption(user, "Colonne Inconnue", "Prénom");

    expect(
      within(screen.getByRole("combobox", { name: "Prénom" })).getByText(
        "Ignorer cette colonne",
      ),
    ).toBeInTheDocument();
    // Prénom reste mappé (désormais sur la 3e colonne) et Nom n'a pas bougé :
    // les deux champs requis restent couverts, Continuer reste activé.
    expect(screen.getByRole("button", { name: "Continuer" })).toBeEnabled();
  });

  it("le bouton Continuer est désactivé si le nom n'est mappé à aucune colonne", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToMappingStep(user);

    await selectOption(user, "Nom", "Ignorer cette colonne");

    expect(screen.getByRole("button", { name: "Continuer" })).toBeDisabled();
  });

  it("Continuer envoie les lignes mappées à l'étape de prévisualisation", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToPreviewStep(user, [{ index: 0, status: "NEW", candidates: [] }]);

    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      "/clubs/1/teams/5/roster/import/preview",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.rows).toEqual([{ firstName: "Karim", lastName: "Benali" }]);
    expect(screen.getByText("Nouveau")).toBeInTheDocument();
  });

  it("une ligne Nouveau est incluse par défaut et envoie une décision CREATE à la validation", async () => {
    const user = userEvent.setup();
    const onSuccess = renderDialog();
    await goToPreviewStep(user, [{ index: 0, status: "NEW", candidates: [] }]);

    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ created: 1, updated: 0, reactivated: 0 }),
    );
    await user.click(screen.getByRole("button", { name: "Valider l'import" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, options] = mockApiFetch.mock.calls[2];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { action: "CREATE", row: { firstName: "Karim", lastName: "Benali" } },
    ]);
  });

  it("décocher Inclure exclut la ligne de la validation", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToMappingStep(user, parsedFileTwoRows);
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse([
        { index: 0, status: "NEW", candidates: [] },
        { index: 1, status: "NEW", candidates: [] },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByText("Karim Benali");

    await user.click(screen.getByRole("checkbox", { name: "Inclure Karim Benali" }));
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ created: 1, updated: 0, reactivated: 0 }),
    );
    await user.click(screen.getByRole("button", { name: "Valider l'import" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    const [, options] = mockApiFetch.mock.calls[2];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { action: "CREATE", row: { firstName: "Zoe", lastName: "Martin" } },
    ]);
  });

  const reactivationCandidate = {
    playerId: 42,
    memberId: 7,
    firstName: "Karim",
    lastName: "Benali",
    birthDate: null,
    licenseNumber: "L123",
    activeAssignmentInTeam: null,
    lastAssignment: { id: 3, jerseyNumber: 9, mainPosition: "ST", secondaryPositions: [] },
    activeTeamsElsewhere: [],
  };

  it("une ligne Réactivation envoie REACTIVATE par défaut, et CREATE si déclinée", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToPreviewStep(user, [
      { index: 0, status: "REACTIVATION", candidates: [reactivationCandidate] },
    ]);

    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ created: 0, updated: 0, reactivated: 1 }),
    );
    await user.click(screen.getByRole("button", { name: "Valider l'import" }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    const body = JSON.parse((mockApiFetch.mock.calls[2][1] as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { action: "REACTIVATE", playerId: 42, row: { firstName: "Karim", lastName: "Benali" } },
    ]);
  });

  it("décliner la réactivation envoie une décision CREATE", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToPreviewStep(user, [
      { index: 0, status: "REACTIVATION", candidates: [reactivationCandidate] },
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Réactiver ce joueur" }));
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ created: 1, updated: 0, reactivated: 0 }),
    );
    await user.click(screen.getByRole("button", { name: "Valider l'import" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    const body = JSON.parse((mockApiFetch.mock.calls[2][1] as RequestInit).body as string);
    expect(body.decisions).toEqual([
      { action: "CREATE", row: { firstName: "Karim", lastName: "Benali" } },
    ]);
  });

  it("une ligne Ambigu bloque la validation tant qu'aucun choix n'est fait", async () => {
    const user = userEvent.setup();
    renderDialog();
    await goToPreviewStep(user, [
      {
        index: 0,
        status: "AMBIGUOUS",
        candidates: [
          reactivationCandidate,
          { ...reactivationCandidate, playerId: 43, licenseNumber: "L124" },
        ],
      },
    ]);

    expect(screen.getByRole("button", { name: "Valider l'import" })).toBeDisabled();

    await selectOption(
      user,
      "Choisir un joueur...",
      "Karim Benali — licence L123",
    );

    expect(screen.getByRole("button", { name: "Valider l'import" })).toBeEnabled();
  });
});
