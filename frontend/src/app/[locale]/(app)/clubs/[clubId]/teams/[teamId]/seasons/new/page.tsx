"use client";

import { use } from "react";
import { SeasonWizard } from "@/components/seasons/season-wizard";

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom.
export function NewSeasonPageContent({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  return <SeasonWizard clubId={clubId} teamId={teamId} />;
}

export default function NewSeasonPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string }>;
}) {
  const { clubId, teamId } = use(params);
  return <NewSeasonPageContent clubId={clubId} teamId={teamId} />;
}
