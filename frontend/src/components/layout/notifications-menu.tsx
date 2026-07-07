"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Cloche placeholder uniquement : le système de notification (email/push/in-app)
// reste une décision ouverte, voir docs/decisions-ouvertes-et-rgpd.md §2/§4.
export function NotificationsMenu() {
  const t = useTranslations("header.notifications");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("title")} />
        }
      >
        <Bell className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
