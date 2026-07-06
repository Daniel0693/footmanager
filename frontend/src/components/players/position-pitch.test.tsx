import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { PositionPitch } from "./position-pitch";

describe("PositionPitch", () => {
  it("mode Principal par défaut : cliquer un poste le définit comme poste principal", async () => {
    const onSelectMain = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PositionPitch
        mainPosition={null}
        secondaryPositions={[]}
        onSelectMain={onSelectMain}
        onToggleSecondary={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Milieu défensif" }));

    expect(onSelectMain).toHaveBeenCalledWith("CDM");
  });

  it("cliquer à nouveau sur le poste principal déjà sélectionné le désélectionne", async () => {
    const onSelectMain = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PositionPitch
        mainPosition="CDM"
        secondaryPositions={[]}
        onSelectMain={onSelectMain}
        onToggleSecondary={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Milieu défensif" }));

    expect(onSelectMain).toHaveBeenCalledWith(null);
  });

  it("onglet Autres : cliquer un poste bascule les postes secondaires (pas le principal)", async () => {
    const onSelectMain = jest.fn();
    const onToggleSecondary = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PositionPitch
        mainPosition="CAM"
        secondaryPositions={[]}
        onSelectMain={onSelectMain}
        onToggleSecondary={onToggleSecondary}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Autres" }));
    await user.click(screen.getByRole("button", { name: "Milieu défensif" }));

    expect(onToggleSecondary).toHaveBeenCalledWith("CDM");
    expect(onSelectMain).not.toHaveBeenCalled();
  });

  it("un poste déjà principal est désactivé dans l'onglet Autres (pas de confusion/doublon)", async () => {
    const onToggleSecondary = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PositionPitch
        mainPosition="CDM"
        secondaryPositions={[]}
        onSelectMain={jest.fn()}
        onToggleSecondary={onToggleSecondary}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Autres" }));
    const spot = screen.getByRole("button", { name: "Milieu défensif" });
    expect(spot).toHaveAttribute("aria-disabled", "true");

    await user.click(spot);
    expect(onToggleSecondary).not.toHaveBeenCalled();
  });

  it("les deux points d'un même poste (ex. Défenseur central) se sélectionnent ensemble", async () => {
    renderWithIntl(
      <PositionPitch
        mainPosition="CB"
        secondaryPositions={[]}
        onSelectMain={jest.fn()}
        onToggleSecondary={jest.fn()}
      />,
    );

    const spots = screen.getAllByRole("button", { name: "Défenseur central" });
    expect(spots).toHaveLength(2);
    for (const spot of spots) {
      expect(spot).toHaveAttribute("aria-pressed", "true");
    }
  });

  it("affiche les badges : principal en premier, puis chaque poste secondaire", () => {
    renderWithIntl(
      <PositionPitch
        mainPosition="CAM"
        secondaryPositions={["CDM", "CF"]}
        onSelectMain={jest.fn()}
        onToggleSecondary={jest.fn()}
      />,
    );

    expect(screen.getByText("Milieu offensif")).toBeInTheDocument();
    expect(screen.getByText("Milieu défensif")).toBeInTheDocument();
    expect(screen.getByText("Avant-centre")).toBeInTheDocument();
  });

  it("affiche le diminutif traduit du poste sur le terrain (ex. ST -> BU en français), pas le code brut de l'enum", () => {
    renderWithIntl(
      <PositionPitch
        mainPosition="ST"
        secondaryPositions={[]}
        onSelectMain={jest.fn()}
        onToggleSecondary={jest.fn()}
      />,
    );

    const spot = screen.getByRole("button", { name: "Buteur" });
    expect(spot).toHaveTextContent("BU");
    expect(spot).not.toHaveTextContent("ST");
  });

  it("désactivé (sauvegarde en cours) : un clic ne déclenche aucun callback", async () => {
    const onSelectMain = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <PositionPitch
        mainPosition={null}
        secondaryPositions={[]}
        onSelectMain={onSelectMain}
        onToggleSecondary={jest.fn()}
        disabled
      />,
    );

    await user.click(screen.getByRole("button", { name: "Milieu défensif" }));

    expect(onSelectMain).not.toHaveBeenCalled();
  });
});
