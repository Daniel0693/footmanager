"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
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

interface SeasonChampionship {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  team: { id: number; name: string };
}

// Championnats de la saison, toutes équipes du club confondues (docs/roadmap.md
// B16) : surtout utile à l'AdminClub pour naviguer rapidement vers le
// championnat d'une équipe donnée sans passer par chaque fiche équipe. Le
// backend (`SeasonChampionshipsController`) réserve cette vue cross-équipe au
// scope CLUB/ALL (`championship READ` sans `?teamId=`) — un Coach/Player reçoit
// un 403 attendu, traité ici comme "rien à afficher" (pas une erreur à
// signaler par toast, cette vue n'a jamais eu vocation à leur être ouverte).
export function SeasonChampionshipsPanel({
  clubId,
  seasonId,
}: {
  clubId: string;
  seasonId: string;
}) {
  const t = useTranslations("seasonDetail");
  const { accessToken } = useAuth();
  const [championships, setChampionships] = useState<SeasonChampionship[] | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadChampionships = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/seasons/${seasonId}/championships`, {
        headers: authHeaders(accessToken),
      });
      if (response.status === 403) {
        setRestricted(true);
        return;
      }
      if (!response.ok) throw new Error();
      const data = (await response.json()) as SeasonChampionship[];
      setChampionships(data);
      setRestricted(false);
      setHasError(false);
    } catch {
      setHasError(true);
    }
  }, [clubId, seasonId, accessToken]);

  useEffect(() => {
    // Bootstrap volontaire : charge les championnats au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChampionships();
  }, [loadChampionships]);

  if (restricted) {
    return <p className="text-sm text-muted-foreground">{t("championshipsRestricted")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("championshipsTitle")}</h2>

      {hasError ? (
        <p className="text-sm text-destructive">{t("championshipsLoadFailed")}</p>
      ) : championships !== null && championships.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("championshipsEmpty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnChampionshipName")}</TableHead>
              <TableHead>{t("columnChampionshipTeam")}</TableHead>
              <TableHead>{t("columnChampionshipDates")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(championships ?? []).map((championship) => (
              <TableRow key={championship.id}>
                <TableCell>
                  <Link
                    href={`/clubs/${clubId}/teams/${championship.team.id}/championships/${championship.id}`}
                    className="font-medium underline"
                  >
                    {championship.name}
                  </Link>
                </TableCell>
                <TableCell>{championship.team.name}</TableCell>
                <TableCell>
                  {formatDate(championship.startDate)} – {formatDate(championship.endDate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
