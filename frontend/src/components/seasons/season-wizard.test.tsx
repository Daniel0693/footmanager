import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { push } from "@/test-utils/navigation-mock";
import { SeasonWizard } from "./season-wizard";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

// SeasonWizardCreateStep/SeasonWizardRosterStep ont chacun leur propre suite
// de tests dédiée — mockés ici pour isoler la logique d'orchestration du
// wizard (navigation entre étapes, affichage des récapitulatifs).
jest.mock("./season-wizard-create-step", () => ({
  SeasonWizardCreateStep: ({
    onCreated,
  }: {
    onCreated: (season: {
      id: number;
      name: string;
      startDate: string;
      endDate: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCreated({
          id: 10,
          name: "Saison 2026-2027",
          startDate: "2026-08-01",
          endDate: "2027-06-30",
        })
      }
    >
      Simuler la création
    </button>
  ),
}));

jest.mock("./season-wizard-roster-step", () => ({
  SeasonWizardRosterStep: ({
    onImported,
  }: {
    onImported: (count: number) => void;
  }) => (
    <button type="button" onClick={() => onImported(3)}>
      Simuler l&apos;import
    </button>
  ),
}));

jest.mock("./season-wizard-activation-step", () => ({
  SeasonWizardActivationStep: ({
    onActivated,
  }: {
    onActivated: () => void;
  }) => (
    <button type="button" onClick={onActivated}>
      Simuler l&apos;activation
    </button>
  ),
}));

describe("SeasonWizard", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("affiche le formulaire de création à l'étape 1 en mode nouvelle saison", () => {
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    expect(screen.getByRole("button", { name: "Simuler la création" })).toBeInTheDocument();
  });

  it("passe à l'étape 2 (import roster) après création de la saison", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));

    expect(screen.getByRole("button", { name: "Simuler l'import" })).toBeInTheDocument();
  });

  it("revenir à l'étape 1 après création affiche un récapitulatif, jamais le formulaire à nouveau", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Création" }));

    expect(screen.getByText("Étape déjà complétée.")).toBeInTheDocument();
    expect(screen.getByText("Saison 2026-2027")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Simuler la création" }),
    ).not.toBeInTheDocument();
  });

  it("passe à l'étape 3 (championnats, optionnelle) après import du roster", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'import" }));

    expect(
      screen.getByText(
        "Les championnats pourront être configurés plus tard, depuis la fiche de la saison.",
      ),
    ).toBeInTheDocument();
  });

  it("passe à l'étape 4 (activation) en cliquant Suivant sur l'étape championnats", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'import" }));
    await user.click(screen.getByRole("button", { name: "Suivant" }));

    expect(
      screen.getByRole("button", { name: "Simuler l'activation" }),
    ).toBeInTheDocument();
  });

  it("redirige vers la fiche de saison après activation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'import" }));
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'activation" }));

    expect(push).toHaveBeenCalledWith("/clubs/1/teams/5/seasons/10");
  });

  it("marque l'étape championnats comme complétée une fois passée (navigation arrière possible)", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'import" }));
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await user.click(screen.getByRole("button", { name: "Championnats" }));

    expect(
      screen.getByText(
        "Les championnats pourront être configurés plus tard, depuis la fiche de la saison.",
      ),
    ).toBeInTheDocument();
  });

  it("revenir à l'étape 2 après import affiche un récapitulatif, jamais le formulaire à nouveau", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));
    await user.click(screen.getByRole("button", { name: "Simuler l'import" }));
    await user.click(screen.getByRole("button", { name: "Effectif" }));

    expect(screen.getByText("3 joueur(s) reconduit(s) pour cette saison.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Simuler l'import" }),
    ).not.toBeInTheDocument();
  });

  it("reprend directement à l'étape 2 (import roster) quand une saison existe déjà (initialSeason)", () => {
    renderWithIntl(
      <SeasonWizard
        clubId="1"
        teamId="5"
        initialSeason={{
          id: 10,
          name: "Saison 2026-2027",
          startDate: "2026-08-01",
          endDate: "2027-06-30",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Simuler l'import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Création" })).toBeEnabled();
  });
});
