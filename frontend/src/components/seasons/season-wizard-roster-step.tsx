"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { Position } from "@/lib/positions";

interface RosterImportCandidate {
  playerId: number;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  mainPosition: Position | null;
}

// Étape 2 du wizard (docs/modules/saisons-championnats.md) : roster actif
// actuel de l'équipe, tout coché par défaut (décochable), confirmation ->
// POST .../roster-import. Ne pose aucun leaveDate côté backend à ce stade
// (réservé à l'activation, A9) — voir SeasonRosterImportService.
export function SeasonWizardRosterStep({
  clubId,
  teamId,
  seasonId,
  onImported,
}: {
  clubId: string;
  teamId: string;
  seasonId: number;
  onImported: (importedCount: number) => void;
}) {
  const t = useTranslations("seasons.wizard.rosterStep");
  const tPositions = useTranslations("positions");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [candidates, setCandidates] = useState<RosterImportCandidate[] | null>(
    null,
  );
  const [hasError, setHasError] = useState(false);
  const [retainedIds, setRetainedIds] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}/roster-import-preview`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as RosterImportCandidate[];
      setCandidates(data);
      // Tout coché par défaut (décochable) — docs/modules/saisons-championnats.md.
      setRetainedIds(new Set(data.map((candidate) => candidate.playerId)));
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, seasonId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge le roster actif à l'ouverture de
    // l'étape — cas d'usage légitime d'un effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreview();
  }, [loadPreview]);

  const toggle = (playerId: number) => {
    setRetainedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const onSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}/roster-import`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ retainedPlayerIds: Array.from(retainedIds) }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      const result = (await response.json()) as { importedCount: number };
      toast.success(t("imported"));
      onImported(result.importedCount);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("importFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasError) {
    return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
  }
  if (candidates === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>{t("columnName")}</TableHead>
              <TableHead>{t("columnJersey")}</TableHead>
              <TableHead>{t("columnPosition")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate) => (
              <TableRow key={candidate.playerId}>
                <TableCell>
                  <Checkbox
                    checked={retainedIds.has(candidate.playerId)}
                    onCheckedChange={() => toggle(candidate.playerId)}
                    aria-label={`${candidate.firstName} ${candidate.lastName}`}
                  />
                </TableCell>
                <TableCell>
                  {candidate.firstName} {candidate.lastName}
                </TableCell>
                <TableCell>
                  {candidate.jerseyNumber ?? t("emptyValue")}
                </TableCell>
                <TableCell>
                  {candidate.mainPosition
                    ? tPositions(candidate.mainPosition)
                    : t("emptyValue")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Button onClick={onSubmit} disabled={isSubmitting} className="self-start">
        {t("submit")}
      </Button>
    </div>
  );
}
