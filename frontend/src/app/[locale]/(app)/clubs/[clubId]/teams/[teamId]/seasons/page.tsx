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

interface Season {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}

// Composant nommé séparé du default export de page.tsx : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom.
export function SeasonsPageContent({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  const t = useTranslations("seasons");
  const tStatus = useTranslations("seasons.status");
  const { accessToken } = useAuth();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const loadSeasons = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      setSeasons((await response.json()) as Season[]);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les saisons de l'équipe au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeasons();
  }, [loadSeasons]);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link
        href={`/clubs/${clubId}/teams`}
        className="text-sm text-muted-foreground underline"
      >
        {t("backToTeams")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button
          nativeButton={false}
          render={<Link href={`/clubs/${clubId}/teams/${teamId}/seasons/new`} />}
        >
          {t("newSeason")}
        </Button>
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
              <TableHead className="text-right">{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(seasons ?? []).map((season) => (
              <TableRow key={season.id}>
                <TableCell>
                  <Link
                    href={`/clubs/${clubId}/teams/${teamId}/seasons/${season.id}`}
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
                <TableCell className="text-right">
                  {season.status === "DRAFT" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/clubs/${clubId}/teams/${teamId}/seasons/${season.id}/wizard`}
                        />
                      }
                    >
                      {t("continueSetup")}
                    </Button>
                  )}
                </TableCell>
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
  params: Promise<{ clubId: string; teamId: string }>;
}) {
  const { clubId, teamId } = use(params);
  return <SeasonsPageContent clubId={clubId} teamId={teamId} />;
}
