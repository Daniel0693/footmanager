"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactElement } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkPlayerRowFields } from "@/components/players/bulk-player-row-fields";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

const NONE = "NONE";

// Une ligne du roster actuellement chargée (page effectif) — sous-ensemble
// des champs de RosterRow nécessaires au pré-remplissage (gender/joinDate
// exposés par RosterRow depuis le correctif du 2026-07-10 — déjà chargés
// côté backend, aucun coût réseau supplémentaire).
export interface BulkEditableRow {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: string | null;
  birthDate: string | null;
  jerseyNumber: number | null;
  mainPosition: string | null;
  joinDate: string | null;
}

const rowSchema = z.object({
  id: z.number(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  jerseyNumber: z.string().optional(),
  mainPosition: z.string().optional(),
  joinDate: z.string().optional(),
});

const formSchema = z.object({ items: z.array(rowSchema).min(1) });

type FormValues = z.infer<typeof formSchema>;

function toRowValues(row: BulkEditableRow) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone ?? "",
    gender: row.gender ?? NONE,
    // .slice(0, 10) : l'API renvoie une date ISO complète
    // ("2011-03-04T00:00:00.000Z"), mais <input type="date"> n'accepte que
    // "AAAA-MM-JJ" — sans ça, le navigateur rejette la valeur et affiche le
    // champ vide (même correctif déjà appliqué ailleurs dans le projet,
    // voir absence-form-dialog.tsx/objective-form-dialog.tsx).
    birthDate: row.birthDate?.slice(0, 10) ?? "",
    jerseyNumber: row.jerseyNumber !== null ? String(row.jerseyNumber) : "",
    mainPosition: row.mainPosition ?? NONE,
    joinDate: row.joinDate?.slice(0, 10) ?? "",
  };
}

function toIsoDateOrUndefined(value?: string) {
  return value && value.trim() !== "" ? value : undefined;
}

function toTextOrUndefined(value?: string) {
  return value && value.trim() !== "" ? value : undefined;
}

function toSelectOrUndefined(value?: string) {
  return value && value !== NONE ? value : undefined;
}

// Édition en masse (B4/B5.4) : tableau pré-rempli depuis le roster
// actuellement AFFICHÉ (donc limité à la page/au filtre en cours — voir
// `note` sous le tableau) — contrairement à la création, aucune ligne ne
// peut être ajoutée/retirée ici, chaque ligne cible un PlayerTeam existant
// (id figé, jamais modifiable). Un seul PATCH .../roster/bulk pour toutes
// les lignes, tout-ou-rien.
export function BulkEditPlayersDialog({
  clubId,
  teamId,
  rows,
  trigger,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  rows: BulkEditableRow[];
  trigger: ReactElement;
  onSuccess: () => void;
}) {
  const t = useTranslations("bulkPlayers");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { items: rows.map(toRowValues) },
  });
  const { fields } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (open) reset({ items: rows.map(toRowValues) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const items = values.items.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: toTextOrUndefined(row.phone),
        gender: toSelectOrUndefined(row.gender),
        birthDate: toIsoDateOrUndefined(row.birthDate),
        jerseyNumber:
          row.jerseyNumber && row.jerseyNumber.trim() !== ""
            ? Number(row.jerseyNumber)
            : undefined,
        mainPosition: toSelectOrUndefined(row.mainPosition),
        joinDate: toIsoDateOrUndefined(row.joinDate),
      }));
      const response = await apiFetch(`/clubs/${clubId}/teams/${teamId}/roster/bulk`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(t("editSuccess", { count: items.length }));
      setOpen(false);
      onSuccess();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] overflow-auto sm:max-w-[calc(100vw-4rem)]">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("editScopeNote")}</p>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("firstName")}</TableHead>
                  <TableHead>{t("lastName")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("gender")}</TableHead>
                  <TableHead>{t("birthDate")}</TableHead>
                  <TableHead>{t("jerseyNumber")}</TableHead>
                  <TableHead>{t("mainPosition")}</TableHead>
                  <TableHead>{t("joinDate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => (
                  <TableRow key={field.id}>
                    <BulkPlayerRowFields
                      control={control}
                      register={register}
                      namePrefix={`items.${index}`}
                      errors={errors.items?.[index]}
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
