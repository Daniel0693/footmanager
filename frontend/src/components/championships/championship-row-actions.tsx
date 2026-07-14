"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ChampionshipFormDialog,
  type ExistingChampionship,
} from "@/components/championships/championship-form-dialog";

// Colonne Actions de la liste des championnats — même convention que
// SeasonRowActions/ExternalTeamRowActions (menu ⋮, masqué entièrement si
// `!canManage`, jamais déduit d'un rôle côté client).
export function ChampionshipRowActions({
  clubId,
  teamId,
  championship,
  canManage,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  championship: ExistingChampionship;
  canManage: boolean;
  onSuccess: () => void;
}) {
  const t = useTranslations("championships");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!canManage) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/championships/${championship.id}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("deleted"));
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("deleteFailed"));
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
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="size-4" />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChampionshipFormDialog
        clubId={clubId}
        teamId={teamId}
        championship={championship}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          setEditOpen(false);
          onSuccess();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
            <AlertDialogClose
              render={
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {t("deleteConfirm")}
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
