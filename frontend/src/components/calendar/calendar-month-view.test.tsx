import { fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { CalendarMonthView } from "./calendar-month-view";
import type { ExistingEvent } from "./event-form-dialog";
import { EVENT_TYPES } from "@/lib/event";

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

const allTypesFilters = { types: new Set(EVENT_TYPES), teamIds: new Set([5, 8]) };

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

function renderMonthView(overrides: Partial<ComponentProps<typeof CalendarMonthView>> = {}) {
  return renderWithIntl(
    <CalendarMonthView
      clubId="1"
      month={new Date(2026, 6, 1)}
      onMonthChange={jest.fn()}
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

describe("CalendarMonthView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse([]));
  });

  it("affiche le libellé du mois et les en-têtes de jours de la semaine", async () => {
    renderMonthView();

    expect(screen.getByText("juillet 2026")).toBeInTheDocument();
    expect(screen.getByText("lun.")).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  });

  it("charge les événements bornés à la grille affichée (pas tout l'historique)", async () => {
    renderMonthView();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    // Grille de juillet 2026 : commence le lundi 29 juin, finit le
    // dimanche 9 août (42 jours).
    expect(query.get("dateFrom")).toBe(new Date(2026, 5, 29).toISOString());
    expect(query.get("types")).toBe("TRAINING,MATCH,OTHER");
    expect(query.get("teamIds")).toBe("5,8");
  });

  it("navigue au mois précédent/suivant", async () => {
    const onMonthChange = jest.fn();
    renderMonthView({ onMonthChange });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 7, 1));

    fireEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 5, 1));
  });

  it("place un événement sur le jour de son startAt, avec son heure", async () => {
    const theEvent = event();
    mockApiFetch.mockResolvedValue(jsonResponse([theEvent]));
    renderMonthView();

    const cell = await waitFor(() => screen.getByTestId(dayKey(new Date(2026, 6, 10))));
    expect(cell).toHaveTextContent("Match amical");
    const expectedTime = new Date(theEvent.startAt).toLocaleTimeString("fr", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(cell).toHaveTextContent(expectedTime);
  });

  it("un clic simple sur une cellule vide sélectionne un seul jour", async () => {
    const onSelectRange = jest.fn();
    renderMonthView({ onSelectRange });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const cell = screen.getByTestId(dayKey(new Date(2026, 6, 15)));
    fireEvent.mouseDown(cell);
    fireEvent.mouseUp(window);

    expect(onSelectRange).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 15));
  });

  it("glisser d'une cellule à une autre sélectionne la plage complète", async () => {
    const onSelectRange = jest.fn();
    renderMonthView({ onSelectRange });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    const start = screen.getByTestId(dayKey(new Date(2026, 6, 10)));
    const end = screen.getByTestId(dayKey(new Date(2026, 6, 12)));
    fireEvent.mouseDown(start);
    fireEvent.mouseEnter(end);
    fireEvent.mouseUp(window);

    expect(onSelectRange).toHaveBeenCalledWith(new Date(2026, 6, 10), new Date(2026, 6, 12));
  });

  it("cliquer sur un événement déclenche l'édition sans déclencher une sélection de cellule", async () => {
    const onEditEvent = jest.fn();
    const onSelectRange = jest.fn();
    const theEvent = event();
    mockApiFetch.mockResolvedValue(jsonResponse([theEvent]));
    renderMonthView({ onEditEvent, onSelectRange });

    const chip = await screen.findByText("Match amical");
    fireEvent.click(chip);

    expect(onEditEvent).toHaveBeenCalledWith(theEvent);
    fireEvent.mouseUp(window);
    expect(onSelectRange).not.toHaveBeenCalled();
  });
});
