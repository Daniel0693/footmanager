"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { ExternalTeamFormDialog } from "@/components/championships/external-team-form-dialog";
import { ExternalTeamRowActions } from "@/components/championships/external-team-row-actions";
import type { ExistingExternalTeam } from "@/components/championships/external-team-form-dialog";
import { ChampionshipFormDialog } from "@/components/championships/championship-form-dialog";
import { ChampionshipRowActions } from "@/components/championships/championship-row-actions";
import type { ExistingChampionship } from "@/components/championships/championship-form-dialog";

interface ChampionshipRow extends ExistingChampionship {
  season: { id: number; name: string };
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Scopée équipe (Partie B, docs/roadmap.md) :
// chaque équipe gère son propre championnat, contrairement à Saisons
// (club-wide depuis A14). "Championnats" et "Équipes adverses" pleinement
// fonctionnels depuis B6 (voir docs/roadmap.md).
export function ChampionshipsPageContent({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  const t = useTranslations("championships");
  const tExternal = useTranslations("externalTeams");
  const { accessToken } = useAuth();
  const [externalTeams, setExternalTeams] = useState<ExistingExternalTeam[] | null>(null);
  const [canManageExternalTeams, setCanManageExternalTeams] = useState(false);
  const [externalTeamsError, setExternalTeamsError] = useState(false);
  const [championships, setChampionships] = useState<ChampionshipRow[] | null>(null);
  const [canManageChampionships, setCanManageChampionships] = useState(false);
  const [championshipsError, setChampionshipsError] = useState(false);

  const loadExternalTeams = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/external-teams?teamId=${teamId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        data: ExistingExternalTeam[];
        canManage: boolean;
      };
      setExternalTeams(data.data);
      setCanManageExternalTeams(data.canManage);
      setExternalTeamsError(false);
    } catch {
      setExternalTeamsError(true);
      toast.error(tExternal("loadFailed"));
    }
  }, [clubId, teamId, accessToken, tExternal]);

  const loadChampionships = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        data: ChampionshipRow[];
        canManage: boolean;
      };
      setChampionships(data.data);
      setCanManageChampionships(data.canManage);
      setChampionshipsError(false);
    } catch {
      setChampionshipsError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge championnats et équipes adverses au
    // montage — cas d'usage légitime d'un effect (pas un état dérivable du
    // rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChampionships();
    void loadExternalTeams();
  }, [loadChampionships, loadExternalTeams]);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Tabs defaultValue="championships">
        <TabsList>
          <TabsTrigger value="championships">{t("tabs.championships")}</TabsTrigger>
          <TabsTrigger value="externalTeams">{t("tabs.externalTeams")}</TabsTrigger>
        </TabsList>
        <TabsContent value="championships">
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center justify-end">
              {canManageChampionships && (
                <ChampionshipFormDialog
                  clubId={clubId}
                  teamId={teamId}
                  onSuccess={loadChampionships}
                  trigger={<Button>{t("addButton")}</Button>}
                />
              )}
            </div>

            {championshipsError ? (
              <p className="text-sm text-destructive">{t("loadFailed")}</p>
            ) : championships !== null && championships.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnName")}</TableHead>
                    <TableHead>{t("columnSeason")}</TableHead>
                    <TableHead>{t("columnDates")}</TableHead>
                    {canManageChampionships && (
                      <TableHead className="w-0">{t("actions")}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(championships ?? []).map((championship) => (
                    <TableRow key={championship.id}>
                      <TableCell>
                        <Link
                          href={`/clubs/${clubId}/teams/${teamId}/championships/${championship.id}`}
                          className="font-medium underline"
                        >
                          {championship.name}
                        </Link>
                      </TableCell>
                      <TableCell>{championship.season.name}</TableCell>
                      <TableCell>
                        {formatDate(championship.startDate)} –{" "}
                        {formatDate(championship.endDate)}
                      </TableCell>
                      {canManageChampionships && (
                        <TableCell>
                          <ChampionshipRowActions
                            clubId={clubId}
                            teamId={teamId}
                            championship={championship}
                            canManage={canManageChampionships}
                            onSuccess={loadChampionships}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="externalTeams">
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center justify-end">
              {canManageExternalTeams && (
                <ExternalTeamFormDialog
                  clubId={clubId}
                  teamId={teamId}
                  onSuccess={loadExternalTeams}
                  trigger={<Button>{tExternal("addButton")}</Button>}
                />
              )}
            </div>

            {externalTeamsError ? (
              <p className="text-sm text-destructive">{tExternal("loadFailed")}</p>
            ) : externalTeams !== null && externalTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tExternal("empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tExternal("columnName")}</TableHead>
                    <TableHead>{tExternal("columnCity")}</TableHead>
                    <TableHead>{tExternal("columnCountry")}</TableHead>
                    {canManageExternalTeams && (
                      <TableHead className="w-0">{tExternal("actions")}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(externalTeams ?? []).map((externalTeam) => (
                    <TableRow key={externalTeam.id}>
                      <TableCell className="font-medium">{externalTeam.name}</TableCell>
                      <TableCell>{externalTeam.city ?? "—"}</TableCell>
                      <TableCell>{externalTeam.country ?? "—"}</TableCell>
                      {canManageExternalTeams && (
                        <TableCell>
                          <ExternalTeamRowActions
                            clubId={clubId}
                            teamId={teamId}
                            externalTeam={externalTeam}
                            canManage={canManageExternalTeams}
                            onSuccess={loadExternalTeams}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChampionshipsPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string }>;
}) {
  const { clubId, teamId } = use(params);
  return <ChampionshipsPageContent clubId={clubId} teamId={teamId} />;
}
