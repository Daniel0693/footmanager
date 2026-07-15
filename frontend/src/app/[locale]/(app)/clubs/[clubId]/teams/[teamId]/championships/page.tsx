"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type {
  ChampionshipCreateScope,
  ExistingChampionship,
} from "@/components/championships/championship-form-dialog";

interface ChampionshipRow extends ExistingChampionship {
  season: { id: number; name: string };
  // Présent uniquement en vue club-wide (AdminClub/SuperAdmin/Proprietaire,
  // B20) — absent en vue scopée équipe (Coach/Player), où toutes les lignes
  // appartiennent de toute façon à la même équipe (celle de l'URL).
  team?: { id: number; name: string };
}

interface ClubOption {
  id: number;
  name: string;
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Scopée équipe par défaut (Partie B,
// docs/roadmap.md) : chaque équipe gère son propre championnat, contrairement
// à Saisons (club-wide depuis A14). Retour utilisateur (B20) : la table
// pivote en vue club-wide (colonne Équipe) dès que `readScope` (renvoyé par
// le backend, jamais déduit d'un rôle côté client) est CLUB (AdminClub) ou
// ALL (SuperAdmin/Proprietaire, précédé d'un sélecteur de club) — la vue
// scopée équipe (Coach/Player) reste strictement inchangée.
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
  const [createScope, setCreateScope] = useState<ChampionshipCreateScope | null>(null);
  const [readScope, setReadScope] = useState<ChampionshipCreateScope | null>(null);
  const [championshipsError, setChampionshipsError] = useState(false);

  // Vue club-wide (B20) : chargée uniquement si `readScope` est CLUB/ALL.
  const [selectedClubId, setSelectedClubId] = useState(clubId);
  const [clubs, setClubs] = useState<ClubOption[] | null>(null);
  const [clubChampionships, setClubChampionships] = useState<ChampionshipRow[] | null>(null);
  const [clubCanManage, setClubCanManage] = useState(false);
  const [clubCreateScope, setClubCreateScope] = useState<ChampionshipCreateScope | null>(null);
  const [clubChampionshipsError, setClubChampionshipsError] = useState(false);

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
        createScope: ChampionshipCreateScope | null;
        readScope: ChampionshipCreateScope | null;
      };
      setChampionships(data.data);
      setCanManageChampionships(data.canManage);
      setCreateScope(data.createScope);
      setReadScope(data.readScope);
      setChampionshipsError(false);
    } catch {
      setChampionshipsError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, accessToken, t]);

  const loadClubs = useCallback(async () => {
    try {
      const response = await apiFetch("/clubs", { headers: authHeaders(accessToken) });
      if (!response.ok) throw new Error();
      setClubs((await response.json()) as ClubOption[]);
    } catch {
      toast.error(t("clubsLoadFailed"));
    }
  }, [accessToken, t]);

  const loadClubChampionships = useCallback(
    async (forClubId: string) => {
      try {
        const response = await apiFetch(`/clubs/${forClubId}/championships`, {
          headers: authHeaders(accessToken),
        });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as {
          data: ChampionshipRow[];
          canManage: boolean;
          createScope: ChampionshipCreateScope | null;
        };
        setClubChampionships(data.data);
        setClubCanManage(data.canManage);
        setClubCreateScope(data.createScope);
        setClubChampionshipsError(false);
      } catch {
        setClubChampionshipsError(true);
        toast.error(t("loadFailed"));
      }
    },
    [accessToken, t],
  );

  useEffect(() => {
    // Bootstrap volontaire : charge championnats et équipes adverses au
    // montage — cas d'usage légitime d'un effect (pas un état dérivable du
    // rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChampionships();
    void loadExternalTeams();
  }, [loadChampionships, loadExternalTeams]);

  useEffect(() => {
    if (readScope === "CLUB") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadClubChampionships(clubId);
    } else if (readScope === "ALL") {
      void loadClubs();
      void loadClubChampionships(selectedClubId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readScope]);

  const handleClubChange = (value: string | null) => {
    if (!value) return;
    setSelectedClubId(value);
    void loadClubChampionships(value);
  };

  const isClubWide = readScope === "CLUB" || readScope === "ALL";
  const displayedChampionships = isClubWide ? clubChampionships : championships;
  const displayedCanManage = isClubWide ? clubCanManage : canManageChampionships;
  const displayedCreateScope = isClubWide ? clubCreateScope : createScope;
  const displayedError = isClubWide ? clubChampionshipsError : championshipsError;
  const activeClubId = isClubWide ? selectedClubId : clubId;
  const reloadDisplayed = isClubWide
    ? () => loadClubChampionships(selectedClubId)
    : loadChampionships;
  // En vue club-wide, si le club sélectionné diffère de celui de l'URL, le
  // `teamId` de la page n'appartient plus forcément à ce club — un défaut
  // vide force un choix explicite plutôt qu'une présélection invalide.
  const dialogDefaultTeamId = !isClubWide || activeClubId === clubId ? teamId : "";

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
            {readScope === "ALL" && (
              <div className="flex flex-col gap-2 sm:w-64">
                <Label>{t("club")}</Label>
                <Select value={selectedClubId} onValueChange={handleClubChange}>
                  <SelectTrigger className="w-full" aria-label={t("club")}>
                    <SelectValue>
                      {(v: string | null) =>
                        clubs?.find((club) => String(club.id) === v)?.name ??
                        t("clubPlaceholder")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(clubs ?? []).map((club) => (
                      <SelectItem key={club.id} value={String(club.id)}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-end">
              {displayedCanManage && (
                <ChampionshipFormDialog
                  clubId={activeClubId}
                  teamId={dialogDefaultTeamId}
                  createScope={displayedCreateScope}
                  onSuccess={reloadDisplayed}
                  trigger={<Button>{t("addButton")}</Button>}
                />
              )}
            </div>

            {displayedError ? (
              <p className="text-sm text-destructive">{t("loadFailed")}</p>
            ) : displayedChampionships !== null && displayedChampionships.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnName")}</TableHead>
                    {isClubWide && <TableHead>{t("columnTeam")}</TableHead>}
                    <TableHead>{t("columnSeason")}</TableHead>
                    <TableHead>{t("columnDates")}</TableHead>
                    {displayedCanManage && (
                      <TableHead className="w-0">{t("actions")}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(displayedChampionships ?? []).map((championship) => {
                    const rowTeamId = championship.team?.id ?? Number(teamId);
                    return (
                      <TableRow key={championship.id}>
                        <TableCell>
                          <Link
                            href={`/clubs/${activeClubId}/teams/${rowTeamId}/championships/${championship.id}`}
                            className="font-medium underline"
                          >
                            {championship.name}
                          </Link>
                        </TableCell>
                        {isClubWide && <TableCell>{championship.team?.name}</TableCell>}
                        <TableCell>{championship.season.name}</TableCell>
                        <TableCell>
                          {formatDate(championship.startDate)} –{" "}
                          {formatDate(championship.endDate)}
                        </TableCell>
                        {displayedCanManage && (
                          <TableCell>
                            <ChampionshipRowActions
                              clubId={activeClubId}
                              teamId={String(rowTeamId)}
                              championship={championship}
                              canManage={displayedCanManage}
                              onSuccess={reloadDisplayed}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
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
