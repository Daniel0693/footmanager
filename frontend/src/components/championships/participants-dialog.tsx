"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ParticipantsTab } from "@/components/championships/participants-tab";

// Gestion des participants (docs/roadmap.md B16) : plus un onglet de la
// fiche championnat (le classement liste déjà toutes les équipes
// participantes, B14 — un onglet dédié rien que pour les voir était
// redondant), mais une modale ouverte depuis le bouton d'en-tête, réservée à
// `canManage` (ajouter/retirer un participant reste une action d'écriture,
// sans intérêt pour un rôle en lecture seule qui voit déjà tout dans le
// classement).
export function ParticipantsDialog({
  clubId,
  teamId,
  championshipId,
}: {
  clubId: string;
  teamId: string;
  championshipId: string;
}) {
  const t = useTranslations("championshipParticipants");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">{t("manageButton")}</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("manageButton")}</DialogTitle>
        </DialogHeader>
        <ParticipantsTab clubId={clubId} teamId={teamId} championshipId={championshipId} />
      </DialogContent>
    </Dialog>
  );
}
