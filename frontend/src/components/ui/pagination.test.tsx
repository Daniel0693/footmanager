import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { Pagination, PageSizeSelect } from "./pagination";

describe("Pagination", () => {
  it("affiche la page courante et le nombre total de pages", () => {
    renderWithIntl(
      <Pagination page={2} pageSize={20} total={45} onPageChange={jest.fn()} />,
    );

    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
  });

  it("désactive Précédent sur la première page", () => {
    renderWithIntl(
      <Pagination page={1} pageSize={20} total={45} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Précédent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeEnabled();
  });

  it("désactive Suivant sur la dernière page", () => {
    renderWithIntl(
      <Pagination page={3} pageSize={20} total={45} onPageChange={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Suivant" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeEnabled();
  });

  it("appelle onPageChange avec la page suivante/précédente", async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();
    renderWithIntl(
      <Pagination page={2} pageSize={20} total={45} onPageChange={onPageChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Précédent" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("affiche toujours au moins 1 page même si total est 0", () => {
    renderWithIntl(
      <Pagination page={1} pageSize={20} total={0} onPageChange={jest.fn()} />,
    );

    expect(screen.getByText("Page 1 sur 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivant" })).toBeDisabled();
  });
});

describe("PageSizeSelect", () => {
  it("affiche la taille de page courante", () => {
    renderWithIntl(<PageSizeSelect pageSize={50} onPageSizeChange={jest.fn()} />);

    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("propose les trois tailles 20/50/100", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PageSizeSelect pageSize={20} onPageSizeChange={jest.fn()} />);

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByRole("option", { name: "20" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "50" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "100" })).toBeInTheDocument();
  });

  it("appelle onPageSizeChange avec la nouvelle taille choisie", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = jest.fn();
    renderWithIntl(
      <PageSizeSelect pageSize={20} onPageSizeChange={onPageSizeChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "100" }));

    expect(onPageSizeChange).toHaveBeenCalledWith(100);
  });
});
