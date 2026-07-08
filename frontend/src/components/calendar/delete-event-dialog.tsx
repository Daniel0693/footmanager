"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ExistingEvent } from "@/components/calendar/event-form-dialog";

// Confirmation obligatoire avant toute suppression (aucune exception —
// l'ancien comportement supprimait sans validation, cf. docs/roadmap.md).
// Un événement récurrent propose un choix supplémentaire "cet événement
// seulement" / "cet événement et les suivants" (jamais les occurrences
// passées, voir docs/schema/evenements.md §Événements récurrents) ; un
// événement isolé n'a qu'une simple confirmation.
export function DeleteEventDialog({
  event,
  trigger,
  onConfirm,
}: {
  event: ExistingEvent;
  trigger: ReactElement;
  onConfirm: (scope: "single" | "future") => void;
}) {
  const t = useTranslations("calendar");

  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {event.isRecurring
              ? t("deleteDialogRecurringDescription")
              : t("deleteDialogDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {event.isRecurring ? (
            <>
              <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
              <AlertDialogClose
                render={
                  <Button variant="destructive" onClick={() => onConfirm("single")}>
                    {t("scopeSingleOccurrence")}
                  </Button>
                }
              />
              <AlertDialogClose
                render={
                  <Button variant="destructive" onClick={() => onConfirm("future")}>
                    {t("scopeFutureOccurrences")}
                  </Button>
                }
              />
            </>
          ) : (
            <>
              <AlertDialogClose render={<Button variant="outline">{t("cancel")}</Button>} />
              <AlertDialogClose
                render={
                  <Button variant="destructive" onClick={() => onConfirm("single")}>
                    {t("deleteConfirm")}
                  </Button>
                }
              />
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
