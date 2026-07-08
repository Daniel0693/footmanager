"use client";

import { useTranslations } from "next-intl";
import { use } from "react";
import { CalendarPageContent } from "@/components/calendar/calendar-page-content";

export default function CalendarPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = use(params);
  const t = useTranslations("calendar");

  return (
    <div className="flex w-full flex-col gap-4 p-4 lg:h-full lg:min-h-0">
      <h1 className="shrink-0 text-2xl font-semibold">{t("title")}</h1>
      <CalendarPageContent clubId={clubId} />
    </div>
  );
}
