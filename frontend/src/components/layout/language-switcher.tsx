"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
};

export function LanguageSwitcher() {
  const t = useTranslations("header");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select
      value={locale}
      onValueChange={(next) => router.replace(pathname, { locale: next as string })}
    >
      <SelectTrigger aria-label={t("language")} size="sm">
        <Globe className="size-4 text-muted-foreground" />
        <SelectValue>{(value: string) => LOCALE_LABELS[value] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((code) => (
          <SelectItem key={code} value={code}>
            {LOCALE_LABELS[code] ?? code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
