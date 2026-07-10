"use client";

import { Archive, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArchiveRowDialog } from "@/components/players/archive-row-dialog";
import { DeleteMemberDialog } from "@/components/players/delete-member-dialog";
import { ExistingPlayer, PlayerFormDialog } from "@/components/players/player-form-dialog";
import { ExistingStaff, StaffFormDialog } from "@/components/players/staff-form-dialog";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { Foot } from "@/lib/foot";
import type { Gender } from "@/lib/gender";
import type { Position } from "@/lib/positions";
import type { StaffRole } from "@/lib/staff-role";

export type RosterRoleValue = "PLAYER" | StaffRole;

export interface RosterActionRow {
  id: number;
  memberId: number;
  playerId: number | null;
  role: RosterRoleValue;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string | null;
}

interface PlayerDetailResponse {
  id: number;
  licenseNumber: string | null;
  nationality: string | null;
  preferredFoot: Foot | null;
  member: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    gender: Gender | null;
    birthDate: string | null;
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

// Réunit les trois actions de la colonne Actions (Éditer/Archiver/Supprimer,
// docs/modules/effectif-joueurs.md §B5) pour une ligne du tableau roster
// unifié — un joueur ou un membre du staff. "Éditer" diverge selon le rôle :
// un joueur rouvre PlayerFormDialog existant (fetch préalable des champs
// absents du RosterRow léger — licenseNumber/nationality/preferredFoot/
// gender/joinDate), un membre du staff ouvre StaffFormDialog (nouveau,
// aucun fetch nécessaire, RosterRow porte déjà tout ce qu'il édite).
//
// Pas de vérification côté client de la règle "un Adjoint/Co-entraîneur ne
// peut pas modifier la fiche d'un AUTRE Principal" (assertCanModifyPrincipal,
// docs/modules/auth-roles.md) : `canEdit` reflète seulement le scope général
// UPDATE, pas ce cas particulier par ligne, qui dépendrait de connaître le
// memberId ET le scope exact (TEAM vs CLUB/ALL) de l'appelant — non exposés
// aujourd'hui. Le bouton reste donc affiché ; le backend refuse (403) le cas
// échéant, affiché via un simple toast d'erreur plutôt qu'un masquage
// préventif. Compromis délibéré (impact UX mineur, jamais un risque de
// sécurité — la règle d'or reste appliquée côté backend).
export function RosterRowActions({
  clubId,
  teamId,
  row,
  canEdit,
  canDelete,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  row: RosterActionRow;
  canEdit: boolean;
  canDelete: boolean;
  onSuccess: () => void;
}) {
  const t = useTranslations("players");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [editingPlayer, setEditingPlayer] = useState<ExistingPlayer | null>(null);
  const [isFetchingPlayer, setIsFetchingPlayer] = useState(false);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!canEdit && !canDelete) return null;

  const staffData: ExistingStaff = {
    memberId: row.memberId,
    staffId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    birthDate: row.birthDate,
    staffRole: row.role as StaffRole,
  };

  const handleEditClick = async () => {
    if (row.role !== "PLAYER") {
      setStaffDialogOpen(true);
      return;
    }
    if (!row.playerId) return;
    setIsFetchingPlayer(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${row.playerId}?teamId=${teamId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      const detail: PlayerDetailResponse = await response.json();
      const assignment =
        detail.playerTeams.find((pt) => pt.teamId === Number(teamId)) ??
        detail.playerTeams[0];
      if (!assignment) return;
      setEditingPlayer({
        memberId: detail.member.id,
        playerId: detail.id,
        playerTeamId: assignment.id,
        firstName: detail.member.firstName,
        lastName: detail.member.lastName,
        phone: detail.member.phone,
        gender: detail.member.gender,
        licenseNumber: detail.licenseNumber,
        nationality: detail.nationality,
        birthDate: detail.member.birthDate,
        preferredFoot: detail.preferredFoot,
        jerseyNumber: assignment.jerseyNumber,
        mainPosition: assignment.mainPosition,
        secondaryPositions: assignment.secondaryPositions,
        joinDate: assignment.joinDate,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsFetchingPlayer(false);
    }
  };

  const handleArchiveConfirm = async () => {
    const path =
      row.role === "PLAYER"
        ? `/clubs/${clubId}/teams/${teamId}/players/${row.id}/archive`
        : `/clubs/${clubId}/teams/${teamId}/staff/${row.id}/archive`;
    const response = await apiFetch(path, {
      method: "PATCH",
      headers: authHeaders(accessToken),
    });
    if (!response.ok) {
      toast.error(tErrors(await parseErrorCode(response)));
      return;
    }
    toast.success(t("archived"));
    onSuccess();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={t("actions")} />}
        >
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {canEdit && (
            <DropdownMenuItem onClick={() => void handleEditClick()} disabled={isFetchingPlayer}>
              <Pencil className="size-4" />
              {t("edit")}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onClick={() => setArchiveOpen(true)}>
              <Archive className="size-4" />
              {t("archive")}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="size-4" />
              {t("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editingPlayer && (
        <PlayerFormDialog
          clubId={clubId}
          teamId={teamId}
          player={editingPlayer}
          open={!!editingPlayer}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditingPlayer(null);
          }}
          onSuccess={() => {
            setEditingPlayer(null);
            onSuccess();
          }}
        />
      )}

      {row.role !== "PLAYER" && (
        <StaffFormDialog
          clubId={clubId}
          teamId={teamId}
          staff={staffData}
          open={staffDialogOpen}
          onOpenChange={setStaffDialogOpen}
          onSuccess={() => {
            setStaffDialogOpen(false);
            onSuccess();
          }}
        />
      )}

      <ArchiveRowDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={handleArchiveConfirm}
      />

      <DeleteMemberDialog
        clubId={clubId}
        memberId={row.memberId}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}
