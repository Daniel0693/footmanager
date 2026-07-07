import { render, screen } from "@testing-library/react";
import { StarRating } from "./star-rating";

// Convention de notation (CLAUDE.md) : score sur 10, affiché en étoiles sur 5
// (score / 2, arrondi au demi le plus proche pour le rendu visuel).
describe("StarRating", () => {
  it("affiche la valeur exacte à côté des étoiles", () => {
    render(<StarRating score={7.5} />);
    expect(screen.getByText("7.5/10")).toBeInTheDocument();
  });

  it("un score de 10/10 remplit les 5 étoiles, sans demi-étoile", () => {
    const { container } = render(<StarRating score={10} />);
    expect(container.querySelectorAll(".lucide-star")).toHaveLength(5);
    expect(container.querySelectorAll(".lucide-star-half")).toHaveLength(0);
    expect(container.querySelectorAll(".fill-primary")).toHaveLength(5);
  });

  it("un score de 0/10 n'affiche aucune étoile pleine ni demi-étoile", () => {
    const { container } = render(<StarRating score={0} />);
    expect(container.querySelectorAll(".lucide-star-half")).toHaveLength(0);
    expect(container.querySelectorAll(".fill-primary")).toHaveLength(0);
  });

  it("un score de 5/10 (2.5 étoiles) affiche 2 étoiles pleines et une demi-étoile", () => {
    const { container } = render(<StarRating score={5} />);
    expect(container.querySelectorAll(".lucide-star-half")).toHaveLength(1);
    expect(container.querySelectorAll(".fill-primary")).toHaveLength(3);
  });
});
