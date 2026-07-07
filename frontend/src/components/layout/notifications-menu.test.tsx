import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { NotificationsMenu } from "./notifications-menu";

describe("NotificationsMenu", () => {
  it("affiche un état vide au clic sur la cloche (aucune donnée branchée)", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NotificationsMenu />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("Aucune notification pour l'instant")).toBeInTheDocument();
  });
});
