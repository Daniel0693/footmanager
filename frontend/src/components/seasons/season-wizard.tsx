"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { formatDate } from "@/lib/date-format";
import { SeasonWizardCreateStep, type CreatedSeason } from "./season-wizard-create-step";

const WIZARD_STEPS: StepperStep[] = [
  { key: "create", labelKey: "create" },
  { key: "roster", labelKey: "roster" },
  { key: "championships", labelKey: "championships" },
  { key: "activate", labelKey: "activate" },
];

// Étapes 2-4 (import roster, championnats, activation) arrivent en A6-A10 —
// voir docs/roadmap.md. Placeholder générique en attendant, remplacé
// incrément par incrément (même pattern que les onglets "à venir" de la
// fiche joueur).
export function SeasonWizard({
  clubId,
  teamId,
  initialSeason,
}: {
  clubId: string;
  teamId: string;
  // Saison DRAFT déjà créée : reprise du wizard depuis
  // .../seasons/[id]/wizard (bouton "Continuer la configuration", liste des
  // saisons). Absent en création (.../seasons/new).
  initialSeason?: CreatedSeason;
}) {
  const t = useTranslations("seasons.wizard");
  const [season, setSeason] = useState<CreatedSeason | null>(initialSeason ?? null);
  const [currentStepIndex, setCurrentStepIndex] = useState(initialSeason ? 1 : 0);

  // L'étape 1 (création) est la seule marquée complétée pour l'instant :
  // les étapes 2-4 n'ont pas encore de contenu réel à valider (A6-A10).
  const completedSteps = useMemo(() => new Set(season ? [0] : []), [season]);

  const handleCreated = (created: CreatedSeason) => {
    setSeason(created);
    setCurrentStepIndex(1);
  };

  return (
    <div className="flex w-full flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Stepper
        steps={WIZARD_STEPS}
        currentStepIndex={currentStepIndex}
        completedSteps={completedSteps}
        onStepClick={setCurrentStepIndex}
        translationNamespace="seasons.wizard.steps"
      />
      <Card>
        <CardContent className="pt-6">
          {currentStepIndex === 0 &&
            (season ? (
              // Revisite de l'étape 1 après création : jamais le formulaire
              // de création à nouveau (créerait une seconde Season) — un
              // récapitulatif en lecture seule. L'édition se fait depuis la
              // fiche de saison (A11), pas depuis le wizard.
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">{t("alreadyCompleted")}</p>
                <p className="font-medium">{season.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(season.startDate)} – {formatDate(season.endDate)}
                </p>
              </div>
            ) : (
              <SeasonWizardCreateStep
                clubId={clubId}
                teamId={teamId}
                onCreated={handleCreated}
              />
            ))}
          {currentStepIndex > 0 && (
            <p className="text-sm text-muted-foreground">{t("stepComingSoon")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
