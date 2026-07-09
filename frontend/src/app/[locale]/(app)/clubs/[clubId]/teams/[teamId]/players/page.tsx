"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlayerFormDialog } from "@/components/players/player-form-dialog";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import {
  LINE_POSITIONS,
  POSITIONS,
  POSITION_LINES,
  type Position,
  type PositionLine,
} from "@/lib/positions";
import { toQueryString } from "@/lib/query-string";

interface PlayerTeamRow {
  id: number;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  player: {
    id: number;
    member: {
      firstName: string;
      lastName: string;
    };
  };
}

const ALL = "ALL";

// Composant nommé séparé du default export de page.tsx : voir la même note
// dans ../page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom, donc on teste ce composant directement avec
// clubId/teamId déjà résolus plutôt que de passer par `use()`.
export function TeamPlayersPageContent({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  const t = useTranslations("players");
  const tPositions = useTranslations("positions");
  const tPositionLines = useTranslations("positionLines");
  const { accessToken } = useAuth();
  const [roster, setRoster] = useState<PlayerTeamRow[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [lineFilter, setLineFilter] = useState<PositionLine | typeof ALL>(ALL);
  const [positionFilter, setPositionFilter] = useState<Position | typeof ALL>(ALL);

  // Poste exact prioritaire sur la ligne (même priorité que l'ancien filtre
  // JS) : sélectionner un poste précis restreint à ce seul poste, sinon la
  // ligne restreint à tous les postes qui la composent.
  const positionsToQuery = useMemo(
    () =>
      positionFilter !== ALL
        ? [positionFilter]
        : lineFilter !== ALL
          ? LINE_POSITIONS[lineFilter]
          : undefined,
    [positionFilter, lineFilter],
  );

  const fetchRoster = useCallback(async () => {
    const query = toQueryString({ position: positionsToQuery });
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/players${query ? `?${query}` : ""}`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, teamId, accessToken, positionsToQuery]);

  const loadRoster = useCallback(async () => {
    try {
      const data = await fetchRoster();
      setRoster(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchRoster, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRoster();
        if (!cancelled) {
          setRoster(data);
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
  }, [fetchRoster, t]);

  const availablePositions = useMemo(
    () => (lineFilter === ALL ? POSITIONS : LINE_POSITIONS[lineFilter]),
    [lineFilter],
  );

  const handleLineChange = useCallback((value: PositionLine | typeof ALL | null) => {
    setLineFilter(value ?? ALL);
    setPositionFilter(ALL);
  }, []);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link href={`/clubs/${clubId}/teams`} className="text-sm text-muted-foreground underline">
        {t("backToTeams")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <PlayerFormDialog
          clubId={clubId}
          teamId={teamId}
          onSuccess={loadRoster}
          trigger={<Button>{t("addPlayer")}</Button>}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{t("filterByLine")}</span>
          <Select value={lineFilter} onValueChange={handleLineChange}>
            <SelectTrigger>
              <SelectValue>
                {(value: PositionLine | typeof ALL | null) =>
                  value && value !== ALL ? tPositionLines(value) : t("allLines")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allLines")}</SelectItem>
              {POSITION_LINES.map((line) => (
                <SelectItem key={line} value={line}>
                  {tPositionLines(line)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">{t("filterByPosition")}</span>
          <Select
            value={positionFilter}
            onValueChange={(value: Position | typeof ALL | null) => setPositionFilter(value ?? ALL)}
          >
            <SelectTrigger>
              <SelectValue>
                {(value: Position | typeof ALL | null) =>
                  value && value !== ALL ? tPositions(value) : t("allPositions")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allPositions")}</SelectItem>
              {availablePositions.map((position) => (
                <SelectItem key={position} value={position}>
                  {tPositions(position)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : roster !== null && roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("jerseyNumber")}</TableHead>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("mainPosition")}</TableHead>
              <TableHead>{t("secondaryPosition")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(roster ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.jerseyNumber ?? t("emptyValue")}</TableCell>
                <TableCell>
                  <Link
                    href={`/clubs/${clubId}/teams/${teamId}/players/${row.player.id}`}
                    className="underline"
                  >
                    {row.player.member.firstName} {row.player.member.lastName}
                  </Link>
                </TableCell>
                <TableCell>
                  {row.mainPosition ? (
                    <Badge>{tPositions(row.mainPosition)}</Badge>
                  ) : (
                    t("emptyValue")
                  )}
                </TableCell>
                <TableCell>
                  {row.secondaryPositions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.secondaryPositions.map((position) => (
                        <Badge key={position} variant="outline">
                          {tPositions(position)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    t("emptyValue")
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

export default function TeamPlayersPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string }>;
}) {
  const { clubId, teamId } = use(params);
  return <TeamPlayersPageContent clubId={clubId} teamId={teamId} />;
}
