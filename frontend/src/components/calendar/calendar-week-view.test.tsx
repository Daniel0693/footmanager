import { fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { renderWithIntl, screen, waitFor, within } from "@/test-utils/render";
import { EVENT_TYPES } from "@/lib/event";
import { CalendarWeekView } from "./calendar-week-view";
import type { ExistingEvent } from "./event-form-dialog";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  parseErrorCode: jest.fn().mockResolvedValue("AUTH.UNKNOWN"),
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const teams = [
  { id: 5, name: "U15 A" },
  { id: 8, name: "Seniors" },
];

const allTypesFilters = { types: new Set(EVENT_TYPES), teamIds: new Set([5, 8]), showBirthdays: false };

function event(overrides: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: 1,
    type: "MATCH",
    title: "Match amical",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: null,
    location: null,
    description: null,
    isRecurring: false,
    team: teams[1],
    ...overrides,
  };
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function renderWeekView(overrides: Partial<ComponentProps<typeof CalendarWeekView>> = {}) {
  return renderWithIntl(
    <CalendarWeekView
      clubId="1"
      week={new Date(2026, 6, 10)}
      onWeekChange={jest.fn()}
      teams={teams}
      filters={allTypesFilters}
      refreshKey={0}
      colorMode="type"
      onSelectRange={jest.fn()}
      onEditEvent={jest.fn()}
      {...overrides}
    />,
  );
}

// 2026-07-10 est un vendredi : la semaine (lundi-dimanche) va du 6 au 12 juillet.
describe("CalendarWeekView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse([]));
  });

  it("affiche la plage de la semaine et les en-têtes de jours", async () => {
    renderWeekView();

    expect(screen.getByText("06 juil. – 12 juil. 2026")).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  });

  it("charge les événements bornés à la semaine affichée", async () => {
    renderWeekView();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    expect(query.get("dateFrom")).toBe(new Date(2026, 6, 6).toISOString());
  });

  it("navigue à la semaine précédente/suivante par pas de 7 jours", async () => {
    const onWeekChange = jest.fn();
    renderWeekView({ onWeekChange });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Semaine suivante" }));
    expect(onWeekChange).toHaveBeenCalledWith(new Date(2026, 6, 13));

    fireEvent.click(screen.getByRole("button", { name: "Semaine précédente" }));
    expect(onWeekChange).toHaveBeenCalledWith(new Date(2026, 5, 29));
  });

  it("place un événement du même jour dans la colonne du bon jour (grille horaire)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([event()]));
    renderWeekView();

    const column = await waitFor(() =>
      screen.getByTestId(`calendar-week-column-${dayKey(new Date(2026, 6, 10))}`),
    );
    expect(within(column).getByText("Match amical")).toBeInTheDocument();
  });

  it("un événement multi-jours apparaît dans le bandeau, pas dans une colonne horaire", async () => {
    const multiDay = event({
      id: 2,
      title: "Vacances",
      startAt: "2026-07-06T00:00:00.000Z",
      endAt: "2026-07-08T00:00:00.000Z",
    });
    mockApiFetch.mockResolvedValue(jsonResponse([multiDay]));
    renderWeekView();

    expect(await screen.findByText("Vacances")).toBeInTheDocument();
    const column = screen.getByTestId(`calendar-week-column-${dayKey(new Date(2026, 6, 6))}`);
    expect(within(column).queryByText("Vacances")).not.toBeInTheDocument();
  });

  it("cliquer dans la grille horaire sélectionne le jour et l'heure approchée", async () => {
    const onSelectRange = jest.fn();
    renderWeekView({ onSelectRange });

    const column = await waitFor(() =>
      screen.getByTestId(`calendar-week-column-${dayKey(new Date(2026, 6, 6))}`),
    );
    // HOUR_START=6h, HOUR_HEIGHT=48px : clientY=96 (rect.top non mocké = 0)
    // correspond à 6h + 96/48 = 8h.
    fireEvent.click(column, { clientY: 96 });

    expect(onSelectRange).toHaveBeenCalledTimes(1);
    const [start, end] = onSelectRange.mock.calls[0] as [Date, Date];
    expect(start.getHours()).toBe(8);
    expect(start.getMinutes()).toBe(0);
    expect(start).toEqual(end);
  });

  it("cliquer sur un événement déclenche l'édition sans ouvrir une création", async () => {
    const onEditEvent = jest.fn();
    const onSelectRange = jest.fn();
    const theEvent = event();
    mockApiFetch.mockResolvedValue(jsonResponse([theEvent]));
    renderWeekView({ onEditEvent, onSelectRange });

    const chip = await screen.findByText("Match amical");
    fireEvent.click(chip);

    expect(onEditEvent).toHaveBeenCalledWith(theEvent);
    expect(onSelectRange).not.toHaveBeenCalled();
  });

  it("deux événements qui se chevauchent le même jour sont placés côte à côte", async () => {
    const first = event({ id: 1, title: "Premier", startAt: "2026-07-10T09:00:00.000Z", endAt: "2026-07-10T10:00:00.000Z" });
    const second = event({ id: 2, title: "Second", startAt: "2026-07-10T09:30:00.000Z", endAt: "2026-07-10T10:30:00.000Z" });
    mockApiFetch.mockResolvedValue(jsonResponse([first, second]));
    renderWeekView();

    const firstChip = await screen.findByText("Premier");
    const secondChip = await screen.findByText("Second");
    const firstLeft = (firstChip.closest("button") as HTMLElement).style.left;
    const secondLeft = (secondChip.closest("button") as HTMLElement).style.left;
    expect(firstLeft).not.toBe(secondLeft);
  });

  it("affiche un anniversaire dans le bandeau du bon jour", async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes("/members/birthdays")) {
        return Promise.resolve(
          jsonResponse([
            { memberId: 9, firstName: "Léa", lastName: "Martin", date: "2026-07-08T00:00:00.000Z", age: 14 },
          ]),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    renderWeekView({ filters: { ...allTypesFilters, showBirthdays: true } });

    const column = await waitFor(() =>
      screen.getByTestId(`calendar-week-column-${dayKey(new Date(2026, 6, 8))}`),
    );
    expect(await screen.findByText("Léa Martin — 14 ans")).toBeInTheDocument();
    expect(within(column).queryByText("Léa Martin — 14 ans")).not.toBeInTheDocument();
  });

  it("ne charge pas les anniversaires quand le filtre est désactivé", async () => {
    renderWeekView({ filters: { ...allTypesFilters, showBirthdays: false } });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(
      mockApiFetch.mock.calls.some(([url]) => (url as string).includes("/members/birthdays")),
    ).toBe(false);
  });
});
