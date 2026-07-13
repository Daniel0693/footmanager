import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { SeasonWizard } from "./season-wizard";

// require() dans la factory jest.mock : nécessaire pour un mock fiable, voir navigation-mock.tsx.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/i18n/navigation", () => require("@/test-utils/navigation-mock"));

// SeasonWizardCreateStep a sa propre suite de tests dédiée — mocké ici pour
// isoler la logique d'orchestration du wizard (navigation entre étapes,
// affichage du récapitulatif).
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

describe("SeasonWizard", () => {
  it("affiche le formulaire de création à l'étape 1 en mode nouvelle saison", () => {
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    expect(screen.getByRole("button", { name: "Simuler la création" })).toBeInTheDocument();
  });

  it("passe à l'étape 2 (placeholder) après création de la saison", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonWizard clubId="1" teamId="5" />);

    await user.click(screen.getByRole("button", { name: "Simuler la création" }));

    expect(
      screen.getByText("Cette étape sera disponible prochainement."),
    ).toBeInTheDocument();
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

  it("reprend directement à l'étape 2 quand une saison existe déjà (initialSeason)", () => {
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

    expect(
      screen.getByText("Cette étape sera disponible prochainement."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Création" })).toBeEnabled();
  });
});
