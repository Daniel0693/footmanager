"use client";

import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell } from "@/components/ui/table";
import { GENDERS } from "@/lib/gender";
import { POSITIONS } from "@/lib/positions";

const NONE = "NONE";

// Une ligne du tableau éditable de création/édition en masse (B4/B5.4) —
// les mêmes champs que CreateRosterRowDto/UpdateRosterRowDto côté backend
// (identité + jerseyNumber/mainPosition/joinDate). Un seul poste secondaire
// par ligne, même simplification que PlayerFormDialog (le terrain interactif
// de la fiche joueur reste le seul endroit pour en gérer plusieurs).
export interface BulkPlayerRowValues {
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: string;
  birthDate?: string;
  jerseyNumber?: string;
  mainPosition?: string;
  joinDate?: string;
}

// `namePrefix` est un chemin `items.${index}` généré par l'appelant (un
// FieldArray) — `control`/`register`/`errors` volontairement typés `any` :
// react-hook-form type strictement les chemins de champs par littéral
// (`items.${number}.firstName`), incompatible avec deux formulaires appelants
// dont la forme exacte diffère (BulkCreate n'a pas de champ `id`, BulkEdit
// oui) tout en partageant ce composant de rendu.
export function BulkPlayerRowFields({
  control,
  register,
  namePrefix,
  errors,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  namePrefix: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: any;
}) {
  const t = useTranslations("playerForm");
  const tGender = useTranslations("gender");
  const tPositions = useTranslations("positions");

  return (
    <>
      <TableCell className="p-1">
        <Input
          aria-label={t("firstName")}
          className="h-7 w-32"
          {...register(`${namePrefix}.firstName`)}
        />
        {errors?.firstName && (
          <p className="text-xs text-destructive">{t("firstNameRequired")}</p>
        )}
      </TableCell>
      <TableCell className="p-1">
        <Input
          aria-label={t("lastName")}
          className="h-7 w-32"
          {...register(`${namePrefix}.lastName`)}
        />
        {errors?.lastName && (
          <p className="text-xs text-destructive">{t("lastNameRequired")}</p>
        )}
      </TableCell>
      <TableCell className="p-1">
        <Input
          aria-label={t("phone")}
          className="h-7 w-32"
          {...register(`${namePrefix}.phone`)}
        />
      </TableCell>
      <TableCell className="p-1">
        <Controller
          control={control}
          name={`${namePrefix}.gender`}
          render={({ field }) => (
            <Select value={(field.value as string) ?? NONE} onValueChange={field.onChange}>
              <SelectTrigger className="w-28" size="sm" aria-label={t("gender")}>
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
      </TableCell>
      <TableCell className="p-1">
        <Input
          aria-label={t("birthDate")}
          type="date"
          className="h-7 w-36"
          {...register(`${namePrefix}.birthDate`)}
        />
      </TableCell>
      <TableCell className="p-1">
        <Input
          aria-label={t("jerseyNumber")}
          type="number"
          min={0}
          className="h-7 w-20"
          {...register(`${namePrefix}.jerseyNumber`)}
        />
      </TableCell>
      <TableCell className="p-1">
        <Controller
          control={control}
          name={`${namePrefix}.mainPosition`}
          render={({ field }) => (
            <Select value={(field.value as string) ?? NONE} onValueChange={field.onChange}>
              <SelectTrigger className="w-32" size="sm" aria-label={t("mainPosition")}>
                <SelectValue>
                  {(value: string | null) =>
                    value && value !== NONE ? tPositions(value) : t("positionUnspecified")
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
      </TableCell>
      <TableCell className="p-1">
        <Input
          aria-label={t("joinDate")}
          type="date"
          className="h-7 w-36"
          {...register(`${namePrefix}.joinDate`)}
        />
      </TableCell>
    </>
  );
}
