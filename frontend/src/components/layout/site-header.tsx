"use client";

import { useTranslations } from "next-intl";
import { Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

interface SiteHeaderProps {
  onToggleSidebar: () => void;
}

export function SiteHeader({ onToggleSidebar }: SiteHeaderProps) {
  const t = useTranslations();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t("header.toggleSidebar")}
          onClick={onToggleSidebar}
        >
          <Menu className="size-4" />
        </Button>
        <span className="text-base font-semibold">{t("common.appName")}</span>
      </div>

      <div className="flex items-center gap-1">
        <NotificationsMenu />
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          aria-label={t("header.settings")}
          render={<Link href="/settings" />}
        >
          <Settings className="size-4" />
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
