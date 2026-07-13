import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "@/test-utils/render";
import { Stepper, type StepperStep } from "./stepper";

const steps: StepperStep[] = [
  { key: "create", labelKey: "create" },
  { key: "roster", labelKey: "roster" },
  { key: "championships", labelKey: "championships" },
  { key: "activate", labelKey: "activate" },
];

describe("Stepper", () => {
  it("affiche toutes les étapes avec leur libellé traduit", () => {
    renderWithIntl(
      <Stepper
        steps={steps}
        currentStepIndex={0}
        completedSteps={new Set()}
        translationNamespace="seasons.wizard.steps"
      />,
    );

    expect(screen.getByText("Création")).toBeInTheDocument();
    expect(screen.getByText("Effectif")).toBeInTheDocument();
    expect(screen.getByText("Championnats")).toBeInTheDocument();
    expect(screen.getByText("Activation")).toBeInTheDocument();
  });

  it("marque l'étape courante avec aria-current=step", () => {
    renderWithIntl(
      <Stepper
        steps={steps}
        currentStepIndex={1}
        completedSteps={new Set([0])}
        translationNamespace="seasons.wizard.steps"
      />,
    );

    expect(screen.getByRole("button", { name: "Effectif" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Création" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("affiche une coche sur les étapes déjà complétées", () => {
    renderWithIntl(
      <Stepper
        steps={steps}
        currentStepIndex={2}
        completedSteps={new Set([0, 1])}
        onStepClick={jest.fn()}
        translationNamespace="seasons.wizard.steps"
      />,
    );

    // Étape complétée : bouton actionnable (pas disabled). Étape à venir :
    // désactivé, jamais cliquable en avant.
    expect(screen.getByRole("button", { name: "Création" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Effectif" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Activation" })).toBeDisabled();
  });

  it("n'appelle onStepClick que pour une étape déjà complétée, jamais pour l'étape courante ou une étape à venir", async () => {
    const onStepClick = jest.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <Stepper
        steps={steps}
        currentStepIndex={2}
        completedSteps={new Set([0, 1])}
        onStepClick={onStepClick}
        translationNamespace="seasons.wizard.steps"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Création" }));
    expect(onStepClick).toHaveBeenCalledWith(0);

    onStepClick.mockClear();
    await user.click(screen.getByRole("button", { name: "Championnats" }));
    expect(onStepClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Activation" }));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("sans onStepClick, aucune étape n'est cliquable même si complétée", () => {
    renderWithIntl(
      <Stepper
        steps={steps}
        currentStepIndex={2}
        completedSteps={new Set([0, 1])}
        translationNamespace="seasons.wizard.steps"
      />,
    );

    expect(screen.getByRole("button", { name: "Création" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Effectif" })).toBeDisabled();
  });
});
