import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen } from "@/test-utils/render";
import { CalendarWeekView } from "./calendar-week-view";
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

// 2026-07-10 est un vendredi : la semaine (lundi-dimanche) va du 6 au 12 juillet.
describe("CalendarWeekView", () => {
  it("affiche la plage de la semaine (lundi de la semaine du jour donné) et les en-têtes", () => {
    renderWithIntl(
      <CalendarWeekView
        week={new Date(2026, 6, 10)}
        onWeekChange={jest.fn()}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    expect(screen.getByText("06 juil. – 12 juil. 2026")).toBeInTheDocument();
  });

  it("navigue à la semaine précédente/suivante par pas de 7 jours", () => {
    const onWeekChange = jest.fn();
    renderWithIntl(
      <CalendarWeekView
        week={new Date(2026, 6, 10)}
        onWeekChange={onWeekChange}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Semaine suivante" }));
    expect(onWeekChange).toHaveBeenCalledWith(new Date(2026, 6, 13));

    fireEvent.click(screen.getByRole("button", { name: "Semaine précédente" }));
    expect(onWeekChange).toHaveBeenCalledWith(new Date(2026, 5, 29));
  });

  it("place un événement sur le bon jour de la semaine", () => {
    renderWithIntl(
      <CalendarWeekView
        week={new Date(2026, 6, 10)}
        onWeekChange={jest.fn()}
        events={[event()]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={jest.fn()}
      />,
    );

    const cell = screen.getByTestId(dayKey(new Date(2026, 6, 10)));
    expect(cell).toHaveTextContent("Match amical");
  });

  it("clic sur une cellule sélectionne un seul jour ; glisser sélectionne une plage", () => {
    const onSelectRange = jest.fn();
    renderWithIntl(
      <CalendarWeekView
        week={new Date(2026, 6, 10)}
        onWeekChange={jest.fn()}
        events={[]}
        teams={teams}
        colorMode="type"
        onSelectRange={onSelectRange}
        onEditEvent={jest.fn()}
      />,
    );

    const mon = screen.getByTestId(dayKey(new Date(2026, 6, 6)));
    const wed = screen.getByTestId(dayKey(new Date(2026, 6, 8)));
    fireEvent.mouseDown(mon);
    fireEvent.mouseEnter(wed);
    fireEvent.mouseUp(window);

    expect(onSelectRange).toHaveBeenCalledWith(new Date(2026, 6, 6), new Date(2026, 6, 8));
  });

  it("cliquer sur un événement déclenche l'édition", () => {
    const onEditEvent = jest.fn();
    const theEvent = event();
    renderWithIntl(
      <CalendarWeekView
        week={new Date(2026, 6, 10)}
        onWeekChange={jest.fn()}
        events={[theEvent]}
        teams={teams}
        colorMode="type"
        onSelectRange={jest.fn()}
        onEditEvent={onEditEvent}
      />,
    );

    fireEvent.click(screen.getByText("Match amical"));

    expect(onEditEvent).toHaveBeenCalledWith(theEvent);
  });
});
