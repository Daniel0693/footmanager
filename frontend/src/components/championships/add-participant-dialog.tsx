"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { ExternalTeamFormDialog } from "@/components/championships/external-team-form-dialog";

interface ExternalTeamOption {
  id: number;
  name: string;
}

// Ajoute une équipe adverse comme participante à un championnat — un
// sélecteur parmi les ExternalTeam du club non encore participantes, ou
// "Créer une nouvelle équipe adverse" (réutilise ExternalTeamFormDialog,
// B3) : après création, la liste se rafraîchit et l'utilisateur la
// sélectionne ensuite dans ce même sélecteur (pas de contrat de retour
// d'id modifié sur ExternalTeamFormDialog, volontairement simple — deux
// étapes plutôt que de toucher un composant déjà livré). Pas de vraie
// recherche serveur (debounce) comme PlayerFormDialog : le nombre
// d'équipes adverses d'un club reste réduit, filtrage client suffisant.
export function AddParticipantDialog({
  clubId,
  teamId,
  championshipId,
  existingExternalTeamIds,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
  existingExternalTeamIds: number[];
  onSuccess: () => void;
}) {
  const t = useTranslations("championshipParticipants");
  const tExternal = useTranslations("externalTeams");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [externalTeams, setExternalTeams] = useState<ExternalTeamOption[] | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadExternalTeams = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/external-teams?teamId=${teamId}`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { data: ExternalTeamOption[] };
      setExternalTeams(body.data);
    } catch {
      toast.error(tExternal("loadFailed"));
    }
  }, [clubId, teamId, accessToken, tExternal]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId("");
      void loadExternalTeams();
    }
  }, [open, loadExternalTeams]);

  const availableTeams = (externalTeams ?? []).filter(
    (team) => !existingExternalTeamIds.includes(team.id),
  );

  const handleAdd = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championshipId}/participants`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ externalTeamId: Number(selectedId) }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("added"));
      setOpen(false);
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">{t("addExternalTeam")}</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addExternalTeam")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {availableTeams.length > 0 ? (
            <Select value={selectedId} onValueChange={(value) => setSelectedId(value ?? "")}>
              <SelectTrigger className="w-full" aria-label={t("selectExternalTeam")}>
                <SelectValue>
                  {(v: string | null) =>
                    availableTeams.find((team) => String(team.id) === v)?.name ??
                    t("selectExternalTeamPlaceholder")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noAvailableExternalTeams")}</p>
          )}

          <ExternalTeamFormDialog
            clubId={clubId}
            teamId={teamId}
            onSuccess={loadExternalTeams}
            trigger={
              <Button type="button" variant="ghost" size="sm">
                {tExternal("addButton")}
              </Button>
            }
          />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={!selectedId || isSubmitting}>
            {t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
