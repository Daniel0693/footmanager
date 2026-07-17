import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen } from "@/test-utils/render";
import { LineupPitch } from "./lineup-pitch";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

function bench(overrides: Record<string, unknown> = {}) {
  return { playerId: 10, firstName: "Tom", lastName: "Joueur", ...overrides };
}

function placed(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 11,
    firstName: "Léa",
    lastName: "Autre",
    spotId: "st",
    shirtNumber: 9,
    ...overrides,
  };
}

describe("LineupPitch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("canManage=true : sélectionner un joueur du banc puis cliquer un poste vide le place", async () => {
    const onPlace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <LineupPitch
        benchPlayers={[bench()]}
        placedPlayers={[]}
        canManage
        onPlace={onPlace}
        onUnplace={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getByRole("button", { name: "Buteur" }));

    expect(onPlace).toHaveBeenCalledWith(10, expect.objectContaining({ id: "st", position: "ST" }));
  });

  it("canManage=true : cliquer un joueur déjà placé le sélectionne, cliquer le banc le retire du terrain", async () => {
    const onUnplace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <LineupPitch
        benchPlayers={[]}
        placedPlayers={[placed()]}
        canManage
        onPlace={jest.fn()}
        onUnplace={onUnplace}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Buteur — Léa Autre" }));
    // Le banc (vide) reste une cible cliquable pour retirer le joueur sélectionné du terrain.
    await user.click(screen.getByText("Aucun joueur disponible").closest("[data-bench-zone]")!);

    expect(onUnplace).toHaveBeenCalledWith(11);
  });

  it("refuse de placer un joueur sur un poste déjà occupé par un autre", async () => {
    const onPlace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <LineupPitch
        benchPlayers={[bench()]}
        placedPlayers={[placed()]}
        canManage
        onPlace={onPlace}
        onUnplace={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getByRole("button", { name: "Buteur — Léa Autre" }));

    expect(onPlace).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("canManage=false : aucune interaction possible, pas de banc affiché", () => {
    renderWithIntl(
      <LineupPitch
        benchPlayers={[]}
        placedPlayers={[placed()]}
        canManage={false}
        onPlace={jest.fn()}
        onUnplace={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "Terrain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buteur — Léa Autre" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.queryByText("Aucun joueur disponible")).not.toBeInTheDocument();
  });
});
