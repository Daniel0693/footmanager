"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { AddParticipantDialog } from "@/components/championships/add-participant-dialog";

interface Participant {
  id: number;
  internalTeam: { id: number; name: string } | null;
  externalTeam: { id: number; name: string } | null;
}

// Onglet Participants de la fiche championnat (docs/modules/
// saisons-championnats.md — ChampionshipParticipant, B9). `internalTeamId`
// est restreint à l'équipe propriétaire du championnat (limite MVP, B8) :
// le bouton "Ajouter notre équipe" ne propose donc jamais qu'un seul choix,
// masqué dès qu'elle participe déjà. Les autres participants sont toujours
// des ExternalTeam (adversaires).
export function ParticipantsTab({
  clubId,
  teamId,
  championshipId,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
}) {
  const t = useTranslations("championshipParticipants");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isAddingOwnTeam, setIsAddingOwnTeam] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadParticipants = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/participants`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { data: Participant[]; canManage: boolean };
      setParticipants(data.data);
      setCanManage(data.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, championshipId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les participants au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadParticipants();
  }, [loadParticipants]);

  const ownTeamParticipates = (participants ?? []).some(
    (participant) => participant.internalTeam?.id === Number(teamId),
  );

  const handleAddOwnTeam = async () => {
    setIsAddingOwnTeam(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/participants`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ internalTeamId: Number(teamId) }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("added"));
      await loadParticipants();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsAddingOwnTeam(false);
    }
  };

  const handleRemove = async (id: number) => {
    setRemovingId(id);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/participants/${id}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("removed"));
      await loadParticipants();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("removeFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  const existingExternalTeamIds = (participants ?? [])
    .map((participant) => participant.externalTeam?.id)
    .filter((id): id is number => id !== undefined);

  return (
    <div className="flex w-full flex-col gap-4">
      {canManage && (
        <div className="flex items-center justify-end gap-2">
          {!ownTeamParticipates && (
            <Button variant="outline" onClick={handleAddOwnTeam} disabled={isAddingOwnTeam}>
              {t("addOwnTeam")}
            </Button>
          )}
          <AddParticipantDialog
            clubId={clubId}
            teamId={teamId}
            championshipId={championshipId}
            existingExternalTeamIds={existingExternalTeamIds}
            onSuccess={loadParticipants}
          />
        </div>
      )}

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : participants !== null && participants.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnName")}</TableHead>
              {canManage && <TableHead className="w-0">{t("actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(participants ?? []).map((participant) => (
              <TableRow key={participant.id}>
                <TableCell className="font-medium">
                  {participant.internalTeam?.name ?? participant.externalTeam?.name}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removingId === participant.id}
                      onClick={() => handleRemove(participant.id)}
                    >
                      {t("remove")}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
