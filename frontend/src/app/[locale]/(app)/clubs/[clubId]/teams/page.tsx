"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { TeamFormDialog, type ExistingTeam } from "@/components/teams/team-form-dialog";
import { TeamRowActions } from "@/components/teams/team-row-actions";

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Refonte B18 (retour utilisateur) :
// création/édition/suppression via `TeamFormDialog`/`TeamRowActions`
// (`canManage`, calculé par le backend — `TeamsService.findMineInClub` —
// réservé à AdminClub+, un Coach n'a jamais ce droit même pour sa propre
// équipe) remplace l'ancien formulaire de création toujours visible, jamais
// gardé par une permission.
export function TeamsPageContent({ clubId }: { clubId: string }) {
  const t = useTranslations("teams");
  const { accessToken } = useAuth();
  const [teams, setTeams] = useState<ExistingTeam[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/mine`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { data: ExistingTeam[]; canManage: boolean };
      setTeams(body.data);
      setCanManage(body.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les équipes du club au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeams();
  }, [loadTeams]);

  return (
    <div className="flex w-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canManage && (
          <TeamFormDialog
            clubId={clubId}
            onSuccess={loadTeams}
            trigger={<Button>{t("createTeam")}</Button>}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : teams === null ? null : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          teams.map((team) => (
            <Card key={team.id}>
              <CardContent className="flex items-center justify-between gap-2">
                <span className="font-medium">{team.name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/clubs/${clubId}/teams/${team.id}/players`} />}
                  >
                    {t("viewRoster")}
                  </Button>
                  <TeamRowActions
                    clubId={clubId}
                    team={team}
                    canManage={canManage}
                    onSuccess={loadTeams}
                  />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function TeamsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = use(params);
  return <TeamsPageContent clubId={clubId} />;
}
