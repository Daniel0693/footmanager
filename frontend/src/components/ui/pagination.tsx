"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Trois tailles seulement (décision produit, docs/modules/effectif-joueurs.md
// §B5) — pas un champ libre, pour éviter une requête pathologique (ex.
// pageSize=10000) côté backend.
export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("pagination");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        {t("pageInfo", { page, totalPages })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

export function PageSizeSelect({
  pageSize,
  onPageSizeChange,
}: {
  pageSize: PageSize;
  onPageSizeChange: (pageSize: PageSize) => void;
}) {
  const t = useTranslations("pagination");

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("rowsPerPage")}</span>
      <Select
        value={String(pageSize)}
        onValueChange={(value: string | null) => {
          if (value) onPageSizeChange(Number(value) as PageSize);
        }}
      >
        <SelectTrigger className="w-20">
          <SelectValue>{(value: string | null) => value ?? String(pageSize)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
