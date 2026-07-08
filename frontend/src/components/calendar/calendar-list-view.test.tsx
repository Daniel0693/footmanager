import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { renderWithIntl, screen, waitFor } from "@/test-utils/render";
import { EVENT_TYPES } from "@/lib/event";
import { CalendarListView } from "./calendar-list-view";

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

const teams = [{ id: 5, name: "U15 A" }];
const allTypesFilters = { types: new Set(EVENT_TYPES), teamIds: new Set([5]) };

function eventItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    type: "MATCH",
    title: "Match amical",
    startAt: "2026-07-10T18:00:00.000Z",
    endAt: null,
    location: null,
    description: null,
    team: teams[0],
    ...overrides,
  };
}

describe("CalendarListView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ accessToken: "token" });
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    jest.useFakeTimers().setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("charge une fenêtre initiale centrée sur aujourd'hui (14 jours avant, 60 jours après)", async () => {
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    const dateFrom = new Date(query.get("dateFrom")!);
    const dateTo = new Date(query.get("dateTo")!);
    const today = new Date("2026-07-10T12:00:00.000Z");
    const daysBefore = Math.round((today.getTime() - dateFrom.getTime()) / 86_400_000);
    const daysAfter = Math.round((dateTo.getTime() - today.getTime()) / 86_400_000);
    expect(daysBefore).toBe(14);
    expect(daysAfter).toBe(60);
  });

  it("sélection de filtre vide : liste vide sans appel réseau", async () => {
    renderWithIntl(
      <CalendarListView
        clubId="1"
        teams={teams}
        filters={{ types: new Set(), teamIds: new Set([5]) }}
        refreshKey={0}
        recenterKey={0}
      />,
    );

    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("affiche les événements reçus", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );

    expect(await screen.findByText("Match amical")).toBeInTheDocument();
  });

  it("scroll près du haut charge les événements plus anciens et les ajoute au début", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 2, title: "Ancien match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 50; // < seuil de 200px : proche du haut

    fireEvent.scroll(container);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    // La borne passée (14 jours avant aujourd'hui) devient le dateTo exclusif
    // du bloc plus ancien chargé (30 jours de plus).
    const dateFrom = new Date(query.get("dateFrom")!);
    const initialPastBoundary = new Date("2026-06-26T12:00:00.000Z"); // aujourd'hui - 14j
    const daysEarlier = Math.round(
      (initialPastBoundary.getTime() - dateFrom.getTime()) / 86_400_000,
    );
    expect(daysEarlier).toBe(30);
    expect(await screen.findByText("Ancien match")).toBeInTheDocument();
    expect(screen.getByText("Match amical")).toBeInTheDocument();
  });

  it("scroll près du bas charge les événements futurs et les ajoute à la fin", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([eventItem({ id: 3, title: "Futur match" })]));

    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 550; // scrollHeight - clientHeight - scrollTop = 50 < seuil

    fireEvent.scroll(container);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Futur match")).toBeInTheDocument();
  });

  it("supprime un événement de la liste sans recharger toute la fenêtre", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");
    mockApiFetch.mockResolvedValue(jsonResponse(null));

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/clubs/1/teams/5/events/1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText("Aucun événement à afficher")).toBeInTheDocument();
  });

  it("le bouton Aujourd'hui (recenterKey) abandonne la fenêtre étendue et revient à la fenêtre initiale", async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse([eventItem()]));
    const { rerender } = renderWithIntl(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={0} />,
    );
    await screen.findByText("Match amical");

    // Étend la fenêtre vers le passé (scroll).
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    const container = screen.getByTestId("calendar-list-scroll");
    Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    container.scrollTop = 50;
    fireEvent.scroll(container);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(jsonResponse([]));
    rerender(
      <CalendarListView clubId="1" teams={teams} filters={allTypesFilters} refreshKey={0} recenterKey={1} />,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url] = mockApiFetch.mock.calls[0];
    const query = new URL(url as string, "http://localhost").searchParams;
    const dateFrom = new Date(query.get("dateFrom")!);
    const today = new Date("2026-07-10T12:00:00.000Z");
    const daysBefore = Math.round((today.getTime() - dateFrom.getTime()) / 86_400_000);
    expect(daysBefore).toBe(14); // fenêtre initiale, pas la fenêtre étendue (44 jours)
  });
});
