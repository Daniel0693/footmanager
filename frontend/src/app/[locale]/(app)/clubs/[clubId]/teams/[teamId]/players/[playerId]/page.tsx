"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { Foot } from "@/lib/foot";
import type { Gender } from "@/lib/gender";
import type { Position } from "@/lib/positions";
import {
  ExistingPlayer,
  PlayerFormDialog,
} from "@/components/players/player-form-dialog";
import { EvaluationTab } from "@/components/players/evaluation-tab";
import { InterviewsTab } from "@/components/players/interviews-tab";
import { MeasurementsTab } from "@/components/players/measurements-tab";
import { NotesTab } from "@/components/players/notes-tab";
import { ObjectivesTab } from "@/components/players/objectives-tab";
import { PositionPitch } from "@/components/players/position-pitch";

interface PlayerDetail {
  id: number;
  licenseNumber: string | null;
  nationality: string | null;
  birthDate: string | null;
  preferredFoot: Foot | null;
  member: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    gender: Gender | null;
    isActive: boolean;
    user: { email: string } | null;
  };
  playerTeams: Array<{
    id: number;
    teamId: number;
    jerseyNumber: number | null;
    mainPosition: Position | null;
    secondaryPositions: Position[];
    joinDate: string | null;
  }>;
}

const DETAIL_TABS = [
  "dashboard",
  "measurements",
  "evaluation",
  "objectives",
  "interview",
  "notes",
  "absence",
  "injury",
] as const;

// Composant nommé séparé du default export : voir la même note dans
// ../page.tsx (TeamPlayersPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom.
export function PlayerDetailPageContent({
  clubId,
  teamId,
  playerId,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
}) {
  const t = useTranslations("playerDetail");
  const tPlayers = useTranslations("players");
  const tGender = useTranslations("gender");
  const tFoot = useTranslations("foot");
  const { accessToken } = useAuth();
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isSavingPosition, setIsSavingPosition] = useState(false);

  const fetchPlayer = useCallback(async () => {
    // teamId en query : /clubs/:clubId/players/:id ne porte pas de teamId
    // dans son URL naturelle, donc un Coach (rôle scopé TEAM sur
    // `player_profile READ`) ne serait jamais autorisé sans lui — voir
    // docs/modules/auth-roles.md §"Patterns découverts". PermissionsGuard
    // résout déjà clubId/teamId depuis params, body OU query.
    const response = await apiFetch(
      `/clubs/${clubId}/players/${playerId}?teamId=${teamId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, playerId, accessToken]);

  const loadPlayer = useCallback(async () => {
    try {
      const data = await fetchPlayer();
      setPlayer(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchPlayer, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPlayer();
        if (!cancelled) {
          setPlayer(data);
          setHasError(false);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPlayer, t]);

  if (hasError) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <Link
          href={`/clubs/${clubId}/teams/${teamId}/players`}
          className="text-sm text-muted-foreground underline"
        >
          {t("backToRoster")}
        </Link>
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      </div>
    );
  }

  if (!player) {
    return null;
  }

  const assignment =
    player.playerTeams.find((pt) => pt.teamId === Number(teamId)) ??
    player.playerTeams[0];

  const existingPlayer: ExistingPlayer | undefined = assignment
    ? {
        memberId: player.member.id,
        playerId: player.id,
        playerTeamId: assignment.id,
        firstName: player.member.firstName,
        lastName: player.member.lastName,
        phone: player.member.phone,
        gender: player.member.gender,
        licenseNumber: player.licenseNumber,
        nationality: player.nationality,
        birthDate: player.birthDate,
        preferredFoot: player.preferredFoot,
        jerseyNumber: assignment.jerseyNumber,
        mainPosition: assignment.mainPosition,
        secondaryPositions: assignment.secondaryPositions,
        joinDate: assignment.joinDate,
      }
    : undefined;

  const initials =
    `${player.member.firstName.charAt(0)}${player.member.lastName.charAt(0)}`.toUpperCase();

  // Sauvegarde immédiate au clic (pas de bouton "Enregistrer" séparé) :
  // PATCH optimiste avec retour à l'état précédent si l'appel échoue.
  const patchAssignment = async (body: Record<string, unknown>) => {
    if (!assignment) return;
    const previousPlayer = player;
    setPlayer({
      ...player,
      playerTeams: player.playerTeams.map((pt) =>
        pt.id === assignment.id ? { ...pt, ...body } : pt,
      ),
    });
    setIsSavingPosition(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/players/${assignment.id}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error();
    } catch {
      setPlayer(previousPlayer);
      toast.error(t("positionUpdateFailed"));
    } finally {
      setIsSavingPosition(false);
    }
  };

  const handleSelectMain = (position: Position | null) => {
    patchAssignment({ mainPosition: position });
  };

  const handleToggleSecondary = (position: Position) => {
    if (!assignment) return;
    const nextSecondary = assignment.secondaryPositions.includes(position)
      ? assignment.secondaryPositions.filter((p) => p !== position)
      : [...assignment.secondaryPositions, position];
    patchAssignment({ secondaryPositions: nextSecondary });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/clubs/${clubId}/teams/${teamId}/players`}
          className="text-sm text-muted-foreground underline"
        >
          {t("backToRoster")}
        </Link>
        {existingPlayer && (
          <PlayerFormDialog
            clubId={clubId}
            teamId={teamId}
            player={existingPlayer}
            onSuccess={loadPlayer}
            trigger={<Button variant="outline">{t("edit")}</Button>}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {initials}
              </div>
              <div className="flex flex-col gap-1">
                <CardTitle>
                  {player.member.firstName} {player.member.lastName}
                </CardTitle>
                <Badge variant="secondary" className="w-fit">
                  {tPlayers("title")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("email")}</span>
                <span>{player.member.user?.email ?? tPlayers("emptyValue")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("phone")}</span>
                <span>{player.member.phone ?? tPlayers("emptyValue")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("birthDate")}</span>
                <span>{player.birthDate ?? tPlayers("emptyValue")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("gender")}</span>
                <span>
                  {player.member.gender ? tGender(player.member.gender) : tPlayers("emptyValue")}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("sportiveInfo")}</CardTitle>
              <Badge variant={player.member.isActive ? "default" : "outline"}>
                {player.member.isActive ? t("statusActive") : t("statusInactive")}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("joinDate")}</span>
                <span>{assignment?.joinDate ?? tPlayers("emptyValue")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("licenseNumber")}</span>
                <span>{player.licenseNumber ?? tPlayers("emptyValue")}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("preferredFoot")}</span>
                <span>
                  {player.preferredFoot ? tFoot(player.preferredFoot) : tPlayers("emptyValue")}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{tPlayers("jerseyNumber")}</span>
                <span>{assignment?.jerseyNumber ?? tPlayers("emptyValue")}</span>
              </div>
            </CardContent>
          </Card>

          {assignment && (
            <Card>
              <CardHeader>
                <CardTitle>{t("positions")}</CardTitle>
              </CardHeader>
              <CardContent>
                <PositionPitch
                  mainPosition={assignment.mainPosition}
                  secondaryPositions={assignment.secondaryPositions}
                  onSelectMain={handleSelectMain}
                  onToggleSecondary={handleToggleSecondary}
                  disabled={isSavingPosition}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs defaultValue="measurements">
          <TabsList className="flex-wrap">
            {DETAIL_TABS.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {t(`tabs.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="measurements">
            <MeasurementsTab clubId={clubId} teamId={teamId} playerId={playerId} />
          </TabsContent>
          <TabsContent value="interview">
            <InterviewsTab clubId={clubId} teamId={teamId} playerId={playerId} />
          </TabsContent>
          <TabsContent value="notes">
            <NotesTab clubId={clubId} teamId={teamId} playerId={playerId} />
          </TabsContent>
          <TabsContent value="objectives">
            <ObjectivesTab clubId={clubId} teamId={teamId} playerId={playerId} />
          </TabsContent>
          <TabsContent value="evaluation">
            <EvaluationTab clubId={clubId} teamId={teamId} playerId={playerId} />
          </TabsContent>
          {DETAIL_TABS.filter(
            (tab) =>
              tab !== "measurements" &&
              tab !== "interview" &&
              tab !== "notes" &&
              tab !== "objectives" &&
              tab !== "evaluation",
          ).map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t("comingSoon")}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

export default function PlayerDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string; playerId: string }>;
}) {
  const { clubId, teamId, playerId } = use(params);
  return (
    <PlayerDetailPageContent clubId={clubId} teamId={teamId} playerId={playerId} />
  );
}
