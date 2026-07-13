"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/date-format";
import { SeasonWizardActivationStep } from "./season-wizard-activation-step";
import { SeasonWizardCreateStep, type CreatedSeason } from "./season-wizard-create-step";
import { SeasonWizardRosterStep } from "./season-wizard-roster-step";

const WIZARD_STEPS: StepperStep[] = [
  { key: "create", labelKey: "create" },
  { key: "roster", labelKey: "roster" },
  { key: "championships", labelKey: "championships" },
  { key: "activate", labelKey: "activate" },
];
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
  const router = useRouter();
  const [season, setSeason] = useState<CreatedSeason | null>(initialSeason ?? null);
  const [currentStepIndex, setCurrentStepIndex] = useState(initialSeason ? 1 : 0);
  // null = roster pas encore importé pour cette session de wizard. Reprise
  // (.../seasons/[id]/wizard) : pas d'info sur un import déjà fait, l'étape
  // réaffiche le formulaire — limite connue, acceptable tant que le wizard
  // se complète en une seule session (voir A6, doc saisons-championnats.md).
  const [importedCount, setImportedCount] = useState<number | null>(null);
  // Étape 3 optionnelle "à ce stade" (docs/modules/saisons-championnats.md)
  // : aucune donnée à valider tant que le module Championship n'existe pas
  // (Partie B). Un simple bouton Suivant, jamais bloquant — rebranché sur le
  // vrai formulaire de championnat en B15.
  const [championshipsStepPassed, setChampionshipsStepPassed] = useState(false);

  const completedSteps = useMemo(() => {
    const completed = new Set<number>();
    if (season) completed.add(0);
    if (importedCount !== null) completed.add(1);
    if (championshipsStepPassed) completed.add(2);
    return completed;
  }, [season, importedCount, championshipsStepPassed]);

  const handleCreated = (created: CreatedSeason) => {
    setSeason(created);
    setCurrentStepIndex(1);
  };

  const handleImported = (count: number) => {
    setImportedCount(count);
    setCurrentStepIndex(2);
  };

  const handleChampionshipsStepNext = () => {
    setChampionshipsStepPassed(true);
    setCurrentStepIndex(3);
  };

  const handleActivated = () => {
    if (!season) return;
    // Fiche de saison arrive en A11 — la route existe déjà (voir plan Partie
    // A) et sera livrée juste après cet incrément.
    router.push(`/clubs/${clubId}/teams/${teamId}/seasons/${season.id}`);
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
          {currentStepIndex === 1 && season !== null && (
            importedCount !== null ? (
              // Revisite de l'étape 2 après import : jamais le formulaire à
              // nouveau (dupliquerait les affectations PlayerTeam créées,
              // voir SeasonRosterImportService) — un récapitulatif en
              // lecture seule, même principe que l'étape 1.
              <p className="text-sm text-muted-foreground">
                {t("rosterStep.alreadyImported", { count: importedCount })}
              </p>
            ) : (
              <SeasonWizardRosterStep
                clubId={clubId}
                teamId={teamId}
                seasonId={season.id}
                onImported={handleImported}
              />
            )
          )}
          {currentStepIndex === 2 && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("championshipsStep.message")}
              </p>
              <Button onClick={handleChampionshipsStepNext} className="self-start">
                {t("championshipsStep.next")}
              </Button>
            </div>
          )}
          {currentStepIndex === 3 && season !== null && (
            <SeasonWizardActivationStep
              clubId={clubId}
              teamId={teamId}
              seasonId={season.id}
              onActivated={handleActivated}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
