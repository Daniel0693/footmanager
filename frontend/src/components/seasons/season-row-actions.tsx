"use client";

import { CheckCircle2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { SeasonStatus } from "@/lib/season-status";
import { SeasonFormDialog } from "@/components/seasons/season-form-dialog";

export interface SeasonActionRow {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  canManage: boolean;
}

// Colonne Actions de la liste des saisons — évite de systématiquement
// ouvrir la fiche de saison pour Activer/Modifier/Supprimer (retour
// utilisateur). Mêmes règles que la fiche détail (season-form-dialog.tsx,
// clubs/[clubId]/seasons/[seasonId]/page.tsx) : `canManage` (backend) masque
// tout le menu pour un rôle en lecture seule, Activer/Supprimer réservés au
// statut DRAFT. `currentActiveSeason` (déjà chargée par la page liste, pas
// de fetch supplémentaire) pré-remplit la confirmation d'activation, comme
// sur la fiche détail.
export function SeasonRowActions({
  clubId,
  season,
  currentActiveSeason,
  onSuccess,
}: {
  clubId: string;
  season: SeasonActionRow;
  currentActiveSeason: SeasonActionRow | null;
  onSuccess: () => void;
}) {
  const t = useTranslations("seasons");
  const tDetail = useTranslations("seasonDetail");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [oldSeasonEndDate, setOldSeasonEndDate] = useState(
    currentActiveSeason?.endDate.slice(0, 10) ?? "",
  );
  const [isActivating, setIsActivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!season.canManage) return null;

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      const body = currentActiveSeason && oldSeasonEndDate ? { oldSeasonEndDate } : {};
      const response = await apiFetch(`/clubs/${clubId}/seasons/${season.id}/activate`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(tDetail("activated"));
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : tDetail("activateFailed"));
    } finally {
      setIsActivating(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(`/clubs/${clubId}/seasons/${season.id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(tDetail("deleted"));
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : tDetail("deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
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
          {season.status === "DRAFT" && (
            <DropdownMenuItem onClick={() => setActivateOpen(true)}>
              <CheckCircle2 className="size-4" />
              {tDetail("activate")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            {tDetail("edit")}
          </DropdownMenuItem>
          {season.status === "DRAFT" && (
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 className="size-4" />
              {tDetail("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SeasonFormDialog
        clubId={clubId}
        season={season}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          setEditOpen(false);
          onSuccess();
        }}
      />

      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDetail("activateDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {currentActiveSeason
                ? tDetail("activateDialogDescriptionWithOldSeason", {
                    name: currentActiveSeason.name,
                  })
                : tDetail("activateDialogDescriptionFirstSeason")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {currentActiveSeason && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`oldSeasonEndDate-${season.id}`}>
                {tDetail("oldSeasonEndDate")}
              </Label>
              <Input
                id={`oldSeasonEndDate-${season.id}`}
                type="date"
                value={oldSeasonEndDate}
                onChange={(event) => setOldSeasonEndDate(event.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{tDetail("cancel")}</Button>} />
            <AlertDialogClose
              render={
                <Button onClick={handleActivate} disabled={isActivating}>
                  {tDetail("activateConfirm")}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDetail("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tDetail("deleteDialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{tDetail("cancel")}</Button>} />
            <AlertDialogClose
              render={
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {tDetail("deleteConfirm")}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
