import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen } from "@/test-utils/render";
import { CalendarMonthView } from "./calendar-month-view";
import type { ExistingEvent } from "./event-form-dialog";

const teams = [
  { id: 5, name: "U15 A" },
  { id: 8, name: "Seniors" },
];

function event(overrides: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: 1,
    type: "MATCH",
    title: "Match amical",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: null,
    location: null,
    description: null,
    team: teams[1],
    ...overrides,
  };
}

function dayKey(date: Date) {
  return `calendar-day-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

describe("CalendarMonthView", () => {
  it("affiche le libellé du mois et les en-têtes de jours de la semaine", () => {
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={jest.fn()}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    expect(screen.getByText("juillet 2026")).toBeInTheDocument();
    expect(screen.getByText("lun.")).toBeInTheDocument();
  });

  it("navigue au mois précédent/suivant", async () => {
    const onMonthChange = jest.fn();
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={onMonthChange}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 7, 1));

    fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 5, 1));
  });

  it("place un événement sur le jour de son startAt", () => {
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={jest.fn()}
        events={[event()]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    // startAt UTC 2026-07-10T18:00 tombe le 10 juillet en heure locale du
    // conteneur de test (UTC également).
    const cell = screen.getByTestId(dayKey(new Date(2026, 6, 10)));
    expect(cell).toHaveTextContent("Match amical");
  });

  it("un clic simple sur une cellule vide sélectionne un seul jour", () => {
    const onSelectRange = jest.fn();
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={jest.fn()}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={onSelectRange}
        onEditEvent={jest.fn()}
      />,
    );

    const cell = screen.getByTestId(dayKey(new Date(2026, 6, 15)));
    fireEvent.mouseDown(cell);
    fireEvent.mouseUp(window);

    expect(onSelectRange).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 15));
  });

  it("glisser d'une cellule à une autre sélectionne la plage complète", () => {
    const onSelectRange = jest.fn();
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={jest.fn()}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={onSelectRange}
        onEditEvent={jest.fn()}
      />,
    );

    const start = screen.getByTestId(dayKey(new Date(2026, 6, 10)));
    const end = screen.getByTestId(dayKey(new Date(2026, 6, 12)));
    fireEvent.mouseDown(start);
    fireEvent.mouseEnter(end);
    fireEvent.mouseUp(window);

    expect(onSelectRange).toHaveBeenCalledWith(new Date(2026, 6, 10), new Date(2026, 6, 12));
  });

  it("cliquer sur un événement déclenche l'édition sans déclencher une sélection de cellule", () => {
    const onEditEvent = jest.fn();
    const onSelectRange = jest.fn();
    const theEvent = event();
    renderWithIntl(
      <CalendarMonthView
        month={new Date(2026, 6, 1)}
        onMonthChange={jest.fn()}
        events={[theEvent]}
        teams={teams}
        colorMode="type"
        onSelectRange={onSelectRange}
        onEditEvent={onEditEvent}
      />,
    );

    fireEvent.click(screen.getByText("Match amical"));

    expect(onEditEvent).toHaveBeenCalledWith(theEvent);
    fireEvent.mouseUp(window);
    expect(onSelectRange).not.toHaveBeenCalled();
  });
});
