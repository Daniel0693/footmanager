"use client";

import { cva } from "class-variance-authority";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface StepperStep {
  key: string;
  labelKey: string;
}

// Composant de présentation pur (aucun état interne, aucun appel réseau) —
// la machine à états d'un éventuel wizard (étape courante, appels API
// séquentiels) vit dans le composant métier qui l'utilise, jamais ici.
// Introduit pour le wizard de création de saison (Partie A), retiré de ce
// flux depuis la révision A14-A17 (docs/roadmap.md — Season simplifiée en
// CRUD, plus de wizard) ; laissé disponible pour un futur besoin similaire.
const stepIndicatorVariants = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
  {
    variants: {
      state: {
        upcoming: "border-border bg-background text-muted-foreground",
        current: "border-primary bg-primary text-primary-foreground",
        done: "border-primary bg-primary/10 text-primary",
      },
    },
    defaultVariants: { state: "upcoming" },
  },
);

export function Stepper({
  steps,
  currentStepIndex,
  completedSteps,
  onStepClick,
  translationNamespace,
}: {
  steps: StepperStep[];
  currentStepIndex: number;
  completedSteps: ReadonlySet<number>;
  // Absent = stepper non navigable (lecture seule).
  onStepClick?: (index: number) => void;
  translationNamespace: string;
}) {
  const t = useTranslations(translationNamespace);

  return (
    <ol className="flex w-full items-center">
      {steps.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const isDone = !isCurrent && completedSteps.has(index);
        const state = isCurrent ? "current" : isDone ? "done" : "upcoming";
        // Navigation autorisée uniquement vers une étape déjà visitée
        // (jamais en avant) — une étape à venir peut dépendre de données
        // que l'étape courante n'a pas encore soumises.
        const isClickable = Boolean(onStepClick) && isDone;
        const label = t(step.labelKey);

        return (
          <li key={step.key} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick?.(index)}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={label}
              className={cn(
                "flex items-center gap-2 rounded-md p-1 text-left",
                isClickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span className={stepIndicatorVariants({ state })}>
                {isDone ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={cn("mx-2 h-px flex-1", isDone ? "bg-primary" : "bg-border")}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
