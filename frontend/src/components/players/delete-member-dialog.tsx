"use client";

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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

// Suppression RGPD en cascade (docs/modules/effectif-joueurs.md §B3) : flux
// en deux temps, pas une simple confirmation. Le premier essai (sans
// forceAnonymize) est bloqué par le backend (409 MEMBERS.REFERENCED_ELSEWHERE)
// si ce membre a laissé des données sur D'AUTRES joueurs — on bascule alors
// vers une seconde confirmation renforcée, explicite, avant de forcer
// l'anonymisation. Tout autre code d'erreur reste une simple erreur (toast),
// pas une bascule vers ce second écran.
export function DeleteMemberDialog({
  clubId,
  memberId,
  open,
  onOpenChange,
  onSuccess,
}: {
  clubId: string;
  memberId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("players");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [stage, setStage] = useState<"confirm" | "forceConfirm">("confirm");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    // Réinitialise pour la prochaine ouverture (ex. sur une autre ligne) —
    // sans ça, rouvrir ce dialogue reprendrait à la 2e étape.
    if (!nextOpen) setStage("confirm");
  };

  const remove = async (forceAnonymize: boolean) => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/clubs/${clubId}/members/${memberId}`, {
        method: "DELETE",
        headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
        body: JSON.stringify({ forceAnonymize }),
      });
      if (response.ok) {
        toast.success(t("deleted"));
        handleOpenChange(false);
        onSuccess();
        return;
      }
      const code = await parseErrorCode(response);
      if (code === "MEMBERS.REFERENCED_ELSEWHERE" && !forceAnonymize) {
        setStage("forceConfirm");
        return;
      }
      toast.error(tErrors(code));
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        {stage === "confirm" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
              <Button
                variant="destructive"
                disabled={isSubmitting}
                onClick={() => void remove(false)}
              >
                {t("deleteConfirm")}
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("forceAnonymizeTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {tErrors("MEMBERS.REFERENCED_ELSEWHERE")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
              <Button
                variant="destructive"
                disabled={isSubmitting}
                onClick={() => void remove(true)}
              >
                {t("forceAnonymizeConfirm")}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
