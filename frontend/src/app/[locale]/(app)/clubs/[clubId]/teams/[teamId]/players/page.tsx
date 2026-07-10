"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSizeSelect, Pagination, type PageSize } from "@/components/ui/pagination";
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
import { BulkCreatePlayersDialog } from "@/components/players/bulk-create-players-dialog";
import { BulkEditPlayersDialog } from "@/components/players/bulk-edit-players-dialog";
import { PlayerFormDialog } from "@/components/players/player-form-dialog";
import { RosterRowActions } from "@/components/players/roster-row-actions";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/date-format";
import {
  LINE_POSITIONS,
  POSITIONS,
  POSITION_LINES,
  type Position,
  type PositionLine,
} from "@/lib/positions";
import { toQueryString } from "@/lib/query-string";

type RosterRole = "PLAYER" | "PRINCIPAL" | "CO_ENTRAINEUR" | "ADJOINT";

interface RosterRow {
  id: number;
  memberId: number;
  playerId: number | null;
  role: RosterRole;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  isArchived: boolean;
}

interface RosterResponse {
  data: RosterRow[];
  total: number;
  canViewArchived: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type RosterSortBy = "jerseyNumber" | "lastName" | "phone" | "email" | "birthDate" | "role";
type SortOrder = "asc" | "desc";
type StatusFilter = "ACTIVE" | "ARCHIVED" | "ALL";

const ALL = "ALL";
const DEFAULT_PAGE_SIZE: PageSize = 20;

const EMPTY_CAPABILITIES = {
  canViewArchived: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
};

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
  const tBulk = useTranslations("bulkPlayers");
  const tRoles = useTranslations("rosterRoles");
  const tPositions = useTranslations("positions");
  const tPositionLines = useTranslations("positionLines");
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES);
  const [hasError, setHasError] = useState(false);
  const [lineFilter, setLineFilter] = useState<PositionLine | typeof ALL>(ALL);
  const [positionFilter, setPositionFilter] = useState<Position | typeof ALL>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [sortBy, setSortBy] = useState<RosterSortBy>("lastName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

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
    const query = toQueryString({
      position: positionsToQuery,
      status: statusFilter,
      sortBy,
      sortOrder,
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await apiFetch(
      `/clubs/${clubId}/teams/${teamId}/roster${query ? `?${query}` : ""}`,
      { headers: authHeaders(accessToken) },
    );
    if (!response.ok) throw new Error();
    return (await response.json()) as RosterResponse;
  }, [clubId, teamId, accessToken, positionsToQuery, statusFilter, sortBy, sortOrder, page, pageSize]);

  const loadRoster = useCallback(async () => {
    try {
      const result = await fetchRoster();
      setRows(result.data);
      setTotal(result.total);
      setCapabilities({
        canViewArchived: result.canViewArchived,
        canCreate: result.canCreate,
        canEdit: result.canEdit,
        canDelete: result.canDelete,
      });
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
        const result = await fetchRoster();
        if (!cancelled) {
          setRows(result.data);
          setTotal(result.total);
          setCapabilities({
            canViewArchived: result.canViewArchived,
            canCreate: result.canCreate,
            canEdit: result.canEdit,
            canDelete: result.canDelete,
          });
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

  // Édition en masse (B4) : joueurs uniquement, limités aux lignes
  // ACTUELLEMENT affichées (page/filtres en cours) — voir bulkPlayers.editScopeNote.
  const playerRows = useMemo(
    () => (rows ?? []).filter((row) => row.role === "PLAYER"),
    [rows],
  );

  const handleLineChange = useCallback((value: PositionLine | typeof ALL | null) => {
    setLineFilter(value ?? ALL);
    setPositionFilter(ALL);
    setPage(1);
  }, []);

  const handlePositionChange = useCallback((value: Position | typeof ALL | null) => {
    setPositionFilter(value ?? ALL);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: StatusFilter | null) => {
    setStatusFilter(value ?? "ACTIVE");
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((value: PageSize) => {
    setPageSize(value);
    setPage(1);
  }, []);

  const handleSort = useCallback(
    (column: RosterSortBy) => {
      setSortOrder((prevOrder) => {
        if (sortBy === column) return prevOrder === "asc" ? "desc" : "asc";
        return "asc";
      });
      setSortBy(column);
      setPage(1);
    },
    [sortBy],
  );

  const sortIcon = (column: RosterSortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  };

  const sortableHead = (column: RosterSortBy, label: string) => (
    <TableHead>
      <button
        type="button"
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {sortIcon(column)}
      </button>
    </TableHead>
  );

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link href={`/clubs/${clubId}/teams`} className="text-sm text-muted-foreground underline">
        {t("backToTeams")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <div className="flex gap-2">
          {capabilities.canCreate && (
            <BulkCreatePlayersDialog
              clubId={clubId}
              teamId={teamId}
              onSuccess={loadRoster}
              trigger={<Button variant="outline">{tBulk("createTitle")}</Button>}
            />
          )}
          {capabilities.canEdit && playerRows.length > 0 && (
            <BulkEditPlayersDialog
              clubId={clubId}
              teamId={teamId}
              rows={playerRows}
              onSuccess={loadRoster}
              trigger={<Button variant="outline">{tBulk("editTitle")}</Button>}
            />
          )}
          {capabilities.canCreate && (
            <PlayerFormDialog
              clubId={clubId}
              teamId={teamId}
              onSuccess={loadRoster}
              trigger={<Button>{t("addPlayer")}</Button>}
            />
          )}
        </div>
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
          <Select value={positionFilter} onValueChange={handlePositionChange}>
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

        {capabilities.canViewArchived && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t("statusFilter")}</span>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue>
                  {(value: StatusFilter | null) =>
                    value === "ARCHIVED"
                      ? t("statusArchived")
                      : value === "ALL"
                        ? t("statusAll")
                        : t("statusActive")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
                <SelectItem value="ARCHIVED">{t("statusArchived")}</SelectItem>
                <SelectItem value="ALL">{t("statusAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {hasError ? (
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      ) : rows !== null && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHead("jerseyNumber", t("jerseyNumber"))}
                {sortableHead("lastName", t("lastName"))}
                <TableHead>{t("firstName")}</TableHead>
                {sortableHead("phone", t("phone"))}
                {sortableHead("email", t("email"))}
                {sortableHead("birthDate", t("birthDateColumn"))}
                <TableHead>{t("mainPosition")}</TableHead>
                <TableHead>{t("secondaryPosition")}</TableHead>
                {sortableHead("role", t("roleColumn"))}
                {(capabilities.canEdit || capabilities.canDelete) && (
                  <TableHead className="text-right">{t("actions")}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows ?? []).map((row) => (
                <TableRow key={`${row.role}-${row.id}`} className={row.isArchived ? "opacity-60" : undefined}>
                  <TableCell>{row.jerseyNumber ?? t("emptyValue")}</TableCell>
                  <TableCell>
                    {row.role === "PLAYER" && row.playerId ? (
                      <Link
                        href={`/clubs/${clubId}/teams/${teamId}/players/${row.playerId}`}
                        className="underline"
                      >
                        {row.lastName}
                      </Link>
                    ) : (
                      row.lastName
                    )}
                  </TableCell>
                  <TableCell>{row.firstName}</TableCell>
                  <TableCell>{row.phone ?? t("emptyValue")}</TableCell>
                  <TableCell>{row.email ?? t("emptyValue")}</TableCell>
                  <TableCell>{row.birthDate ? formatDate(row.birthDate) : t("emptyValue")}</TableCell>
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
                  <TableCell>
                    <Badge variant="outline">{tRoles(row.role)}</Badge>
                  </TableCell>
                  {(capabilities.canEdit || capabilities.canDelete) && (
                    <TableCell className="text-right">
                      <RosterRowActions
                        clubId={clubId}
                        teamId={teamId}
                        row={row}
                        canEdit={capabilities.canEdit}
                        canDelete={capabilities.canDelete}
                        onSuccess={loadRoster}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <PageSizeSelect pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </div>
        </>
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
