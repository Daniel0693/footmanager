import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { Button } from "@/components/ui/button";
import { DeleteEventDialog } from "./delete-event-dialog";
import type { ExistingEvent } from "./event-form-dialog";

const team = { id: 8, name: "U15 A" };

function event(overrides: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: 42,
    type: "TRAINING",
    title: "Entraînement",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: "2026-07-10T19:30:00.000Z",
    location: null,
    description: null,
    isRecurring: false,
    team,
    ...overrides,
  };
}

function renderDialog(
  targetEvent: ExistingEvent,
  onConfirm: (scope: "single" | "future") => void,
) {
  return renderWithIntl(
    <DeleteEventDialog
      event={targetEvent}
      trigger={<Button>Supprimer</Button>}
      onConfirm={onConfirm}
    />,
  );
}

describe("DeleteEventDialog", () => {
  it("événement isolé : Annuler referme la confirmation sans appeler onConfirm", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderDialog(event(), onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Voulez-vous vraiment supprimer cet événement ? Cette action est irréversible."),
    ).not.toBeInTheDocument();
  });

  it("événement isolé : Confirmer la suppression appelle onConfirm('single')", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderDialog(event(), onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(onConfirm).toHaveBeenCalledWith("single");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("événement isolé : ne propose pas le choix single/future (réservé aux séries récurrentes)", async () => {
    const user = userEvent.setup();
    renderDialog(event(), jest.fn());

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(
      screen.queryByRole("button", { name: "Cet événement seulement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cet événement et les suivants" }),
    ).not.toBeInTheDocument();
  });

  it("événement récurrent : propose le texte dédié et le choix à trois options", async () => {
    const user = userEvent.setup();
    renderDialog(event({ isRecurring: true }), jest.fn());

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(
      screen.getByText(
        "Cet événement fait partie d'une série récurrente. Que souhaitez-vous supprimer ?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cet événement seulement" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cet événement et les suivants" }),
    ).toBeInTheDocument();
  });

  it("événement récurrent : \"Cet événement seulement\" appelle onConfirm('single')", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderDialog(event({ isRecurring: true }), onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Cet événement seulement" }));

    expect(onConfirm).toHaveBeenCalledWith("single");
  });

  it("événement récurrent : \"Cet événement et les suivants\" appelle onConfirm('future')", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderDialog(event({ isRecurring: true }), onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Cet événement et les suivants" }));

    expect(onConfirm).toHaveBeenCalledWith("future");
  });

  it("événement récurrent : Annuler referme le choix sans appeler onConfirm", async () => {
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderDialog(event({ isRecurring: true }), onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
