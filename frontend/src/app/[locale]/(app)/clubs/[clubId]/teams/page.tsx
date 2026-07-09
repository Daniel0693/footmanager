"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface Team {
  id: number;
  name: string;
}

const createTeamSchema = z.object({
  name: z.string().min(1),
});

type CreateTeamValues = z.infer<typeof createTeamSchema>;

// Composant nommé séparé du default export de page.tsx : `use(params)` (voir
// plus bas) suspend le rendu tant que la Promise n'est pas résolue, ce que
// Next.js gère nativement en production mais que Jest/jsdom ne résout pas de
// façon fiable en test (limitation connue, cf. docs Next.js sur les
// composants async). En testant TeamsPageContent directement avec un
// `clubId` déjà résolu, on couvre toute la logique sans dépendre de `use()`.
export function TeamsPageContent({ clubId }: { clubId: string }) {
  const t = useTranslations("teams");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTeamValues>({ resolver: zodResolver(createTeamSchema) });

  const loadTeams = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams/mine`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      setTeams(await response.json());
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les équipes du club au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeams();
  }, [loadTeams]);

  const onSubmit = async (values: CreateTeamValues) => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/clubs/${clubId}/teams`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("created"));
      reset();
      await loadTeams();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("createTeam")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">{t("teamName")}</Label>
              <Input id="name" placeholder={t("teamNamePlaceholder")} {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{t("teamName")}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {t("create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : teams === null ? null : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          teams.map((team) => (
            <Card key={team.id}>
              <CardContent className="flex items-center justify-between">
                <span className="font-medium">{team.name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/clubs/${clubId}/teams/${team.id}/players`} />}
                >
                  {t("viewRoster")}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default function TeamsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = use(params);
  return <TeamsPageContent clubId={clubId} />;
}
