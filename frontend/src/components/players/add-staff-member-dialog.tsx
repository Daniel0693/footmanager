"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { GENDERS } from "@/lib/gender";
import { STAFF_ROLES } from "@/lib/staff-role";

const NONE = "NONE";

// Même calcul que todayIsoDate() dans player-form-dialog.tsx (date locale,
// pas .toISOString() qui bascule sur UTC) — même décision produit du
// 2026-07-16 : préremplir une date de début à aujourd'hui plutôt que la
// laisser vide, tout en restant modifiable.
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const formSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  staffRole: z.string(),
  startDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toTextOrUndefined(value?: string) {
  return value && value.trim() !== "" ? value : undefined;
}

function toIsoDateOrUndefined(value?: string) {
  return value && value.trim() !== "" ? value : undefined;
}

function toSelectOrUndefined(value?: string) {
  return value && value !== NONE ? value : undefined;
}

function defaultValues(): FormValues {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    gender: NONE,
    birthDate: "",
    // Jamais PRINCIPAL par défaut, même si canAssignPrincipal : éviter de
    // créer accidentellement un second Principal quand ce n'était pas
    // l'intention — un choix explicite reste nécessaire pour ce rôle.
    staffRole: "CO_ENTRAINEUR",
    startDate: todayIsoDate(),
  };
}

// Ajout d'un membre du staff (B5.5, docs/modules/effectif-joueurs.md) :
// nouvelle personne uniquement pour cette première version — pas de
// rapprochement avec un membre existant du club, à la différence du flux
// joueur (PlayerFormDialog). Un seul appel POST .../teams/:teamId/staff
// avec les champs d'identité : le backend crée Member + TeamStaff +
// MemberRole dans une même transaction, jamais en deux appels séparés
// (évite tout Member orphelin en cas d'échec partiel).
export function AddStaffMemberDialog({
  clubId,
  teamId,
  canAssignPrincipal,
  trigger,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  // Miroir de RosterService.findAllByTeam — n'affiche PRINCIPAL comme choix
  // que si le backend l'autoriserait réellement (scope CLUB/ALL), jamais
  // recalculé côté frontend (voir CLAUDE.md — règle d'or des permissions).
  canAssignPrincipal: boolean;
  trigger: ReactElement;
  onSuccess: () => void;
}) {
  const t = useTranslations("staffForm");
  const tRoles = useTranslations("rosterRoles");
  const tGender = useTranslations("gender");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assignableRoles = canAssignPrincipal
    ? STAFF_ROLES
    : STAFF_ROLES.filter((role) => role !== "PRINCIPAL");

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) reset(defaultValues());
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/staff`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({
            firstName: values.firstName,
            lastName: values.lastName,
            phone: toTextOrUndefined(values.phone),
            gender: toSelectOrUndefined(values.gender),
            birthDate: toIsoDateOrUndefined(values.birthDate),
            staffRole: values.staffRole,
            startDate: toIsoDateOrUndefined(values.startDate),
          }),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));

      toast.success(t("created"));
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-staff-firstName">{t("firstName")}</Label>
              <Input id="add-staff-firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">{t("firstNameRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-staff-lastName">{t("lastName")}</Label>
              <Input id="add-staff-lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">{t("lastNameRequired")}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-staff-phone">{t("phone")}</Label>
              <Input id="add-staff-phone" {...register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-staff-birthDate">{t("birthDate")}</Label>
              <Input id="add-staff-birthDate" type="date" {...register("birthDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("gender")}</Label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <Select value={(field.value as string) ?? NONE} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label={t("gender")}>
                      <SelectValue>
                        {(value: string | null) =>
                          value && value !== NONE ? tGender(value) : t("genderUnspecified")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("genderUnspecified")}</SelectItem>
                      {GENDERS.map((gender) => (
                        <SelectItem key={gender} value={gender}>
                          {tGender(gender)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-staff-startDate">{t("startDate")}</Label>
              <Input id="add-staff-startDate" type="date" {...register("startDate")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("role")}</Label>
            <Controller
              control={control}
              name="staffRole"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-label={t("role")}>
                    <SelectValue>
                      {(value: string | null) => (value ? tRoles(value) : "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {tRoles(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

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
