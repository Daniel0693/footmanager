"use client";

import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { ExternalTeamFormDialog } from "@/components/championships/external-team-form-dialog";
import { ExternalTeamRowActions } from "@/components/championships/external-team-row-actions";
import type { ExistingExternalTeam } from "@/components/championships/external-team-form-dialog";

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom. Scopée équipe (Partie B, docs/roadmap.md) :
// chaque équipe gère son propre championnat, contrairement à Saisons
// (club-wide depuis A14). L'onglet "Championnats" reste un placeholder
// jusqu'à B4-B6 ; "Équipes adverses" (ExternalTeam, club-scopée en base
// mais gérée ici car toujours atteinte depuis le contexte d'une équipe,
// voir docs/modules/auth-roles.md) est pleinement fonctionnel dès B3.
export function ChampionshipsPageContent({
  clubId,
  teamId,
}: {
  clubId: string;
  teamId: string;
}) {
  const t = useTranslations("championships");
  const tExternal = useTranslations("externalTeams");
  const { accessToken } = useAuth();
  const [externalTeams, setExternalTeams] = useState<ExistingExternalTeam[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [hasError, setHasError] = useState(false);

  const loadExternalTeams = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/external-teams?teamId=${teamId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as {
        data: ExistingExternalTeam[];
        canManage: boolean;
      };
      setExternalTeams(data.data);
      setCanManage(data.canManage);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(tExternal("loadFailed"));
    }
  }, [clubId, teamId, accessToken, tExternal]);

  useEffect(() => {
    // Bootstrap volontaire : charge les équipes adverses au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadExternalTeams();
  }, [loadExternalTeams]);

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Tabs defaultValue="championships">
        <TabsList>
          <TabsTrigger value="championships">{t("tabs.championships")}</TabsTrigger>
          <TabsTrigger value="externalTeams">{t("tabs.externalTeams")}</TabsTrigger>
        </TabsList>
        <TabsContent value="championships">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("comingSoon")}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="externalTeams">
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center justify-end">
              {canManage && (
                <ExternalTeamFormDialog
                  clubId={clubId}
                  teamId={teamId}
                  onSuccess={loadExternalTeams}
                  trigger={<Button>{tExternal("addButton")}</Button>}
                />
              )}
            </div>

            {hasError ? (
              <p className="text-sm text-destructive">{tExternal("loadFailed")}</p>
            ) : externalTeams !== null && externalTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tExternal("empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tExternal("columnName")}</TableHead>
                    <TableHead>{tExternal("columnCity")}</TableHead>
                    <TableHead>{tExternal("columnCountry")}</TableHead>
                    {canManage && <TableHead className="w-0">{tExternal("actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(externalTeams ?? []).map((externalTeam) => (
                    <TableRow key={externalTeam.id}>
                      <TableCell className="font-medium">{externalTeam.name}</TableCell>
                      <TableCell>{externalTeam.city ?? "—"}</TableCell>
                      <TableCell>{externalTeam.country ?? "—"}</TableCell>
                      {canManage && (
                        <TableCell>
                          <ExternalTeamRowActions
                            clubId={clubId}
                            teamId={teamId}
                            externalTeam={externalTeam}
                            canManage={canManage}
                            onSuccess={loadExternalTeams}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChampionshipsPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string }>;
}) {
  const { clubId, teamId } = use(params);
  return <ChampionshipsPageContent clubId={clubId} teamId={teamId} />;
}
