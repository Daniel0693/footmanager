"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/date-format";
import { seasonStatusBadgeVariant, type SeasonStatus } from "@/lib/season-status";
import { resolveAnyTeamId } from "@/lib/resolve-any-team";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";
import { SeasonRowActions } from "@/components/seasons/season-row-actions";

interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}

// Composant nommé séparé du default export de page.tsx : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Saisons désormais club-wide (révision A14,
// docs/roadmap.md) : plus de teamId dans l'URL, mais un Coach/Player en
// lecture seule (scope TEAM) doit transmettre `?teamId=` pour être autorisé
// par PermissionsGuard (voir seasons.controller.ts, même pattern que
// evaluation_config) — résolu via `resolveAnyTeamId` (n'importe laquelle de
// ses équipes suffit, seule sa présence compte). `canManage` (renvoyé par le
// backend) pilote l'affichage du bouton "Nouvelle saison" : jamais déduit
// d'un rôle côté client, l'autorisation réelle reste backend.
export function SeasonsPageContent({ clubId }: { clubId: string }) {
  const t = useTranslations("seasons");
  const tStatus = useTranslations("seasons.status");
  const { accessToken, user } = useAuth();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadSeasons = useCallback(async () => {
    try {
      const teamId = user ? await resolveAnyTeamId(clubId, user.id, accessToken) : null;
      const query = teamId ? `?teamId=${teamId}` : "";
      const response = await apiFetch(`/clubs/${clubId}/seasons${query}`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { data: Season[]; canManage: boolean };
      setSeasons(data.data);
      setCanManage(data.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, accessToken, user, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les saisons du club au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeasons();
  }, [loadSeasons]);

  // Dérivé du state déjà chargé (pas de fetch supplémentaire) : pré-remplit
  // la confirmation d'activation de la colonne Actions, comme sur la fiche
  // détail (voir SeasonRowActions).
  const activeSeason = (seasons ?? []).find((season) => season.status === "ACTIVE");
  const currentActiveSeason = activeSeason ? { ...activeSeason, canManage } : null;

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canManage && (
          <SeasonFormDialog
            clubId={clubId}
            onSuccess={loadSeasons}
            trigger={<Button>{t("newSeason")}</Button>}
          />
        )}
      </div>

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : seasons !== null && seasons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnName")}</TableHead>
              <TableHead>{t("columnDates")}</TableHead>
              <TableHead>{t("columnStatus")}</TableHead>
              {canManage && <TableHead className="w-0">{t("columnActions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(seasons ?? []).map((season) => (
              <TableRow key={season.id}>
                <TableCell>
                  <Link
                    href={`/clubs/${clubId}/seasons/${season.id}`}
                    className="font-medium underline"
                  >
                    {season.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {formatDate(season.startDate)} – {formatDate(season.endDate)}
                </TableCell>
                <TableCell>
                  <Badge variant={seasonStatusBadgeVariant(season.status)}>
                    {tStatus(season.status)}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <SeasonRowActions
                      clubId={clubId}
                      season={{ ...season, canManage }}
                      currentActiveSeason={currentActiveSeason}
                      onSuccess={loadSeasons}
                    />
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

export default function SeasonsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = use(params);
  return <SeasonsPageContent clubId={clubId} />;
}
