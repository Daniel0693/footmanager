"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BulkPlayerRowFields } from "@/components/players/bulk-player-row-fields";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

const NONE = "NONE";

const rowSchema = z.object({
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

function emptyRow() {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    gender: NONE,
    birthDate: "",
    jerseyNumber: "",
    mainPosition: NONE,
    joinDate: "",
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

// Création en masse (B4/B5.4) : tableau éditable, lignes vides au départ —
// contrairement à PlayerFormDialog (un joueur, trois appels séquentiels),
// un seul POST .../roster/bulk pour toutes les lignes, tout-ou-rien
// (décision produit — voir docs/modules/effectif-joueurs.md §B4).
export function BulkCreatePlayersDialog({
  clubId,
  teamId,
  trigger,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
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
    defaultValues: { items: [emptyRow()] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) reset({ items: [emptyRow()] });
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const items = values.items.map((row) => ({
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
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(t("createSuccess", { count: items.length }));
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] overflow-auto sm:max-w-[calc(100vw-4rem)]">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
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
                  <TableHead />
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
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("removeRow")}
                        disabled={fields.length <= 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button type="button" variant="outline" onClick={() => append(emptyRow())}>
            <Plus className="size-4" />
            {t("addRow")}
          </Button>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("submitCreate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
