import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderWithIntl, screen } from "@/test-utils/render";
import { getFormation } from "@/lib/formations";
import {
  BenchList,
  PitchSvg,
  usePitchInteractions,
  type BenchPlayer,
  type PlacedPlayer,
} from "./lineup-pitch";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const slots = getFormation("4-4-2", "ELEVEN").slots;

// Assemble PitchSvg + BenchList autour de usePitchInteractions, exactement
// comme CompositionColumn (docs/modules/matchs.md §Composition, B7/B8) —
// vérifie que les deux composants, bien que rendus dans des colonnes
// séparées, partagent correctement la sélection/le glisser via le hook.
function Harness({
  benchPlayers,
  placedPlayers,
  canManage,
  onPlace,
  onUnplace,
}: {
  benchPlayers: BenchPlayer[];
  placedPlayers: PlacedPlayer[];
  canManage: boolean;
  onPlace: (playerId: number, spot: { id: string; line: string }) => void;
  onUnplace: (playerId: number) => void;
}) {
  const interactions = usePitchInteractions({ slots, placedPlayers, canManage, onPlace, onUnplace });
  return (
    <div>
      <PitchSvg slots={slots} canManage={canManage} interactions={interactions} />
      <BenchList benchPlayers={benchPlayers} canManage={canManage} interactions={interactions} />
    </div>
  );
}

function bench(overrides: Record<string, unknown> = {}) {
  return { playerId: 10, firstName: "Tom", lastName: "Joueur", ...overrides };
}

function placed(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 11,
    firstName: "Léa",
    lastName: "Autre",
    spotId: "fwd-1",
    shirtNumber: 9,
    isCaptain: false,
    ...overrides,
  };
}

describe("LineupPitch (PitchSvg + BenchList + usePitchInteractions)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("canManage=true : sélectionner un joueur du banc puis cliquer un poste vide le place", async () => {
    const onPlace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <Harness
        benchPlayers={[bench()]}
        placedPlayers={[]}
        canManage
        onPlace={onPlace}
        onUnplace={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getAllByRole("button", { name: "ATT" })[0]);

    expect(onPlace).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id: "fwd-1", line: "FWD" }),
    );
  });

  it("canManage=true : cliquer un joueur déjà placé le sélectionne, cliquer le banc le retire du terrain", async () => {
    const onUnplace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <Harness
        benchPlayers={[]}
        placedPlayers={[placed()]}
        canManage
        onPlace={jest.fn()}
        onUnplace={onUnplace}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ATT — Léa Autre" }));
    await user.click(screen.getByText("Aucun joueur disponible").closest("[data-bench-zone]")!);

    expect(onUnplace).toHaveBeenCalledWith(11);
  });

  it("refuse de placer un joueur sur un poste déjà occupé par un autre", async () => {
    const onPlace = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <Harness
        benchPlayers={[bench()]}
        placedPlayers={[placed()]}
        canManage
        onPlace={onPlace}
        onUnplace={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tom Joueur" }));
    await user.click(screen.getByRole("button", { name: "ATT — Léa Autre" }));

    expect(onPlace).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("canManage=false : terrain en lecture seule, pas de banc affiché", () => {
    renderWithIntl(
      <Harness
        benchPlayers={[]}
        placedPlayers={[placed()]}
        canManage={false}
        onPlace={jest.fn()}
        onUnplace={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "Terrain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ATT — Léa Autre" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.queryByText("Aucun joueur disponible")).not.toBeInTheDocument();
  });

  it("affiche un badge capitaine sur le joueur désigné", () => {
    renderWithIntl(
      <Harness
        benchPlayers={[]}
        placedPlayers={[placed({ isCaptain: true })]}
        canManage
        onPlace={jest.fn()}
        onUnplace={jest.fn()}
      />,
    );

    expect(screen.getByText("C")).toBeInTheDocument();
  });
});
