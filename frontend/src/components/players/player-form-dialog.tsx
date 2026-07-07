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
import { apiFetch, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { FEET, type Foot } from "@/lib/foot";
import { GENDERS, type Gender } from "@/lib/gender";
import { POSITIONS, type Position } from "@/lib/positions";

const NONE = "NONE";

export interface ExistingPlayer {
  memberId: number;
  playerId: number;
  playerTeamId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: Gender | null;
  licenseNumber: string | null;
  nationality: string | null;
  birthDate: string | null;
  preferredFoot: Foot | null;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
  joinDate: string | null;
}

const formSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  gender: z.string().optional(),
  licenseNumber: z.string().optional(),
  nationality: z.string().optional(),
  birthDate: z.string().optional(),
  preferredFoot: z.string().optional(),
  jerseyNumber: z.string().optional(),
  mainPosition: z.string().optional(),
  secondaryPosition: z.string().optional(),
  joinDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function toIsoDateOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toTextOrNull(value?: string): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toSelectOrNull<T extends string>(value?: string): T | null {
  return value && value !== NONE ? (value as T) : null;
}

function defaultValues(player?: ExistingPlayer): FormValues {
  return {
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    phone: player?.phone ?? "",
    gender: player?.gender ?? NONE,
    licenseNumber: player?.licenseNumber ?? "",
    nationality: player?.nationality ?? "",
    birthDate: player?.birthDate ?? "",
    preferredFoot: player?.preferredFoot ?? NONE,
    jerseyNumber: player?.jerseyNumber !== null && player?.jerseyNumber !== undefined
      ? String(player.jerseyNumber)
      : "",
    mainPosition: player?.mainPosition ?? NONE,
    // Le formulaire ne gère qu'un seul poste secondaire (le premier du
    // tableau) : la sélection de plusieurs postes secondaires se fait via le
    // terrain interactif de la fiche joueur (décision du 2026-07-06).
    secondaryPosition: player?.secondaryPositions[0] ?? NONE,
    joinDate: player?.joinDate ?? "",
  };
}

export function PlayerFormDialog({
  clubId,
  teamId,
  trigger,
  player,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  trigger: ReactElement;
  player?: ExistingPlayer;
  onSuccess: () => void;
}) {
  const mode = player ? "edit" : "create";
  const t = useTranslations("playerForm");
  const tGender = useTranslations("gender");
  const tFoot = useTranslations("foot");
  const tPositions = useTranslations("positions");
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
    defaultValues: defaultValues(player),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      reset(defaultValues(player));
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    try {
      const memberPayload = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: toTextOrNull(values.phone) ?? undefined,
        gender: toSelectOrNull<Gender>(values.gender) ?? undefined,
      };
      const profilePayload = {
        licenseNumber: toTextOrNull(values.licenseNumber) ?? undefined,
        nationality: toTextOrNull(values.nationality) ?? undefined,
        birthDate: toIsoDateOrNull(values.birthDate) ?? undefined,
        preferredFoot: toSelectOrNull<Foot>(values.preferredFoot) ?? undefined,
      };
      const jerseyNumber =
        values.jerseyNumber && values.jerseyNumber.trim() !== ""
          ? Number(values.jerseyNumber)
          : undefined;
      const secondaryPosition = toSelectOrNull<Position>(values.secondaryPosition);
      const teamPayload = {
        jerseyNumber,
        mainPosition: toSelectOrNull<Position>(values.mainPosition) ?? undefined,
        secondaryPositions: secondaryPosition ? [secondaryPosition] : [],
        joinDate: toIsoDateOrNull(values.joinDate) ?? undefined,
      };

      if (mode === "create") {
        // teamId en query sur les deux premiers appels : un Coach (rôles
        // scopés TEAM sur `member CREATE`/`player_profile CREATE`) ne serait
        // jamais autorisé sans lui, ces routes ne portant pas teamId dans
        // leur URL naturelle — voir docs/modules/auth-roles.md §"Patterns
        // découverts" (même bug que le mode édition ci-dessous).
        const memberRes = await apiFetch(
          `/clubs/${clubId}/members?teamId=${teamId}`,
          { method: "POST", headers, body: JSON.stringify(memberPayload) },
        );
        if (!memberRes.ok) throw new Error(await parseErrorCode(memberRes));
        const member = await memberRes.json();

        const profileRes = await apiFetch(
          `/clubs/${clubId}/players?teamId=${teamId}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ memberId: member.id, ...profilePayload }),
          },
        );
        if (!profileRes.ok) throw new Error(await parseErrorCode(profileRes));
        const profile = await profileRes.json();

        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ playerId: profile.id, ...teamPayload }),
          },
        );
        if (!teamRes.ok) throw new Error(await parseErrorCode(teamRes));

        toast.success(t("created"));
      } else if (player) {
        // teamId en query : ces deux routes ne portent pas de teamId dans
        // leur URL naturelle, donc un Coach (rôles scopés TEAM sur
        // `member UPDATE`/`player_profile UPDATE`) ne serait jamais autorisé
        // sans lui — voir docs/modules/auth-roles.md §"Patterns découverts".
        const memberRes = await apiFetch(
          `/clubs/${clubId}/members/${player.memberId}?teamId=${teamId}`,
          { method: "PATCH", headers, body: JSON.stringify(memberPayload) },
        );
        if (!memberRes.ok) throw new Error(await parseErrorCode(memberRes));

        const profileRes = await apiFetch(
          `/clubs/${clubId}/players/${player.playerId}?teamId=${teamId}`,
          { method: "PATCH", headers, body: JSON.stringify(profilePayload) },
        );
        if (!profileRes.ok) throw new Error(await parseErrorCode(profileRes));

        const teamRes = await apiFetch(
          `/clubs/${clubId}/teams/${teamId}/players/${player.playerTeamId}`,
          { method: "PATCH", headers, body: JSON.stringify(teamPayload) },
        );
        if (!teamRes.ok) throw new Error(await parseErrorCode(teamRes));

        toast.success(t("updated"));
      }

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
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input id="firstName" {...register("firstName")} />
              {errors.firstName && (
                <p className="text-sm text-destructive">{t("firstNameRequired")}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input id="lastName" {...register("lastName")} />
              {errors.lastName && (
                <p className="text-sm text-destructive">{t("lastNameRequired")}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("gender")}</Label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseNumber">{t("licenseNumber")}</Label>
              <Input id="licenseNumber" {...register("licenseNumber")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nationality">{t("nationality")}</Label>
              <Input id="nationality" {...register("nationality")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthDate">{t("birthDate")}</Label>
              <Input id="birthDate" type="date" {...register("birthDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("preferredFoot")}</Label>
              <Controller
                control={control}
                name="preferredFoot"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          value && value !== NONE ? tFoot(value) : t("footUnspecified")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("footUnspecified")}</SelectItem>
                      {FEET.map((foot) => (
                        <SelectItem key={foot} value={foot}>
                          {tFoot(foot)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jerseyNumber">{t("jerseyNumber")}</Label>
              <Input id="jerseyNumber" type="number" min={0} {...register("jerseyNumber")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="joinDate">{t("joinDate")}</Label>
              <Input id="joinDate" type="date" {...register("joinDate")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("mainPosition")}</Label>
              <Controller
                control={control}
                name="mainPosition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          value && value !== NONE
                            ? tPositions(value)
                            : t("positionUnspecified")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("positionUnspecified")}</SelectItem>
                      {POSITIONS.map((position) => (
                        <SelectItem key={position} value={position}>
                          {tPositions(position)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("secondaryPosition")}</Label>
              <Controller
                control={control}
                name="secondaryPosition"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string | null) =>
                          value && value !== NONE
                            ? tPositions(value)
                            : t("positionUnspecified")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("positionUnspecified")}</SelectItem>
                      {POSITIONS.map((position) => (
                        <SelectItem key={position} value={position}>
                          {tPositions(position)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {mode === "create" ? t("submitCreate") : t("submitEdit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
