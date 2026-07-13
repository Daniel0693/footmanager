"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { seasonStatusBadgeVariant, type SeasonStatus } from "@/lib/season-status";

interface SeasonDetail {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
}

const formSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

function defaultValues(season?: SeasonDetail): FormValues {
  return {
    name: season?.name ?? "",
    // .slice(0, 10) : l'API renvoie une date ISO complète, <input type="date">
    // n'accepte que "AAAA-MM-JJ" (même piège documenté dans player-form-dialog.tsx).
    startDate: season?.startDate.slice(0, 10) ?? "",
    endDate: season?.endDate.slice(0, 10) ?? "",
  };
}

// Composant nommé séparé du default export : voir la note dans
// teams/page.tsx (TeamsPageContent) — `use(params)` ne se résout pas de
// façon fiable sous Jest/jsdom.
export function SeasonDetailPageContent({
  clubId,
  teamId,
  seasonId,
}: {
  clubId: string;
  teamId: string;
  seasonId: string;
}) {
  const t = useTranslations("seasonDetail");
  const tStatus = useTranslations("seasons.status");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { accessToken } = useAuth();
  const [season, setSeason] = useState<SeasonDetail | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const loadSeason = useCallback(async () => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}`,
        { headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as SeasonDetail;
      setSeason(data);
      reset(defaultValues(data));
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [clubId, teamId, seasonId, accessToken, t, reset]);

  useEffect(() => {
    // Bootstrap volontaire : charge la saison au montage — cas d'usage
    // légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeason();
  }, [loadSeason]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}`,
        {
          method: "PATCH",
          headers: authHeaders(accessToken),
          body: JSON.stringify(values),
        },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("updated"));
      await loadSeason();
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/seasons/${seasonId}`,
        { method: "DELETE", headers: authHeaders(accessToken) },
      );
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("deleted"));
      router.push(`/clubs/${clubId}/teams/${teamId}/seasons`);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(code ? tErrors(code) : t("deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (hasError) {
    return (
      <div className="flex w-full flex-col gap-4 p-4">
        <Link
          href={`/clubs/${clubId}/teams/${teamId}/seasons`}
          className="text-sm text-muted-foreground underline"
        >
          {t("backToSeasons")}
        </Link>
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
      </div>
    );
  }

  if (!season) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-4 p-4">
      <Link
        href={`/clubs/${clubId}/teams/${teamId}/seasons`}
        className="text-sm text-muted-foreground underline"
      >
        {t("backToSeasons")}
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{season.name}</h1>
        <Badge variant={seasonStatusBadgeVariant(season.status)}>
          {tStatus(season.status)}
        </Badge>
      </div>

      {season.status === "ARCHIVED" && (
        <p className="text-sm text-muted-foreground">{t("archivedNotice")}</p>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">{t("tabs.info")}</TabsTrigger>
          <TabsTrigger value="championships">{t("tabs.championships")}</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input id="name" {...register("name")} />
                  {errors.name && (
                    <p className="text-sm text-destructive">{t("nameRequired")}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="startDate">{t("startDate")}</Label>
                    <Input id="startDate" type="date" {...register("startDate")} />
                    {errors.startDate && (
                      <p className="text-sm text-destructive">{t("dateRequired")}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="endDate">{t("endDate")}</Label>
                    <Input id="endDate" type="date" {...register("endDate")} />
                    {errors.endDate && (
                      <p className="text-sm text-destructive">{t("dateRequired")}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  {season.status === "DRAFT" ? (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button type="button" variant="destructive">
                            {t("delete")}
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteDialogDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogClose
                            render={<Button variant="outline">{t("cancel")}</Button>}
                          />
                          <AlertDialogClose
                            render={
                              <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={isDeleting}
                              >
                                {t("deleteConfirm")}
                              </Button>
                            }
                          />
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <span />
                  )}
                  <Button type="submit" disabled={isSubmitting}>
                    {t("save")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="championships">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("championshipsComingSoon")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SeasonDetailPage({
  params,
}: {
  params: Promise<{ clubId: string; teamId: string; seasonId: string }>;
}) {
  const { clubId, teamId, seasonId } = use(params);
  return (
    <SeasonDetailPageContent clubId={clubId} teamId={teamId} seasonId={seasonId} />
  );
}
