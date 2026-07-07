import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { StarRatingInput } from "./star-rating-input";

describe("StarRatingInput", () => {
  it("affiche un tiret quand aucune valeur n'est définie", () => {
    render(<StarRatingInput label="Passe courte" value={undefined} onChange={jest.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("cliquer sur la moitié gauche de la première étoile sélectionne 1/10", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<StarRatingInput label="Passe courte" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Passe courte : 1 sur 10" }));

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("cliquer sur la moitié droite de la première étoile sélectionne 2/10", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<StarRatingInput label="Passe courte" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Passe courte : 2 sur 10" }));

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("cliquer sur la moitié droite de la 5e étoile sélectionne 10/10 (score maximum)", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();

    render(<StarRatingInput label="Passe courte" value={undefined} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Passe courte : 10 sur 10" }));

    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("affiche la valeur exacte à côté des étoiles", () => {
    render(<StarRatingInput label="Passe courte" value={7.5} onChange={jest.fn()} />);
    expect(screen.getByText("7.5/10")).toBeInTheDocument();
  });

  it("plusieurs instances sur le même écran n'entrent pas en collision de libellé", () => {
    render(
      <>
        <StarRatingInput label="Passe courte" value={undefined} onChange={jest.fn()} />
        <StarRatingInput label="Frappe" value={undefined} onChange={jest.fn()} />
      </>,
    );
    expect(screen.getByRole("button", { name: "Passe courte : 1 sur 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frappe : 1 sur 10" })).toBeInTheDocument();
  });

  it("les boutons sont désactivés quand `disabled` est vrai", () => {
    render(
      <StarRatingInput label="Passe courte" value={undefined} onChange={jest.fn()} disabled />,
    );
    expect(screen.getByRole("button", { name: "Passe courte : 1 sur 10" })).toBeDisabled();
  });
});
