"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface MyClub {
  id: number;
  name: string;
}

// Member.birthDate arrive sérialisé en ISO complet (ex.
// "2010-07-08T00:00:00.000Z") — <input type="date"> attend "AAAA-MM-JJ".
function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

// Un même User peut être Member de plusieurs clubs (docs/schema/fondations.md)
// — birthDate vit sur Member, donc potentiellement une valeur différente par
// club. Édition volontairement minimale ("Mon profil", docs/roadmap.md) :
// un seul champ pour l'instant, birthDate n'a pas d'autre interface pour les
// rôles non-Player.
export default function SettingsPage() {
  const t = useTranslations("settings");
  const tHeader = useTranslations("header");
  const tErrors = useTranslations("errors");
  const { accessToken } = useAuth();

  const [clubs, setClubs] = useState<MyClub[] | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadClubs = useCallback(async () => {
    try {
      const response = await apiFetch("/clubs", {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const data: MyClub[] = await response.json();
      setClubs(data);
      if (data.length > 0) {
        setSelectedClubId((current) => current ?? String(data[0].id));
      }
    } catch {
      setClubs([]);
    }
  }, [accessToken]);

  useEffect(() => {
    // Bootstrap volontaire : charge les clubs du compte connecté au montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClubs();
  }, [loadClubs]);

  const loadProfile = useCallback(
    async (clubId: string) => {
      setIsLoadingProfile(true);
      try {
        const response = await apiFetch(`/clubs/${clubId}/members/me`, {
          headers: authHeaders(accessToken),
        });
        if (!response.ok) throw new Error();
        const member: { birthDate: string | null } = await response.json();
        setBirthDate(toDateInputValue(member.birthDate));
      } catch {
        toast.error(t("loadFailed"));
      } finally {
        setIsLoadingProfile(false);
      }
    },
    [accessToken, t],
  );

  useEffect(() => {
    if (selectedClubId) {
      // Rechargement volontaire du profil à chaque changement de club
      // sélectionné (Member est par club, pas par User).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadProfile(selectedClubId);
    }
  }, [selectedClubId, loadProfile]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClubId) return;
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/clubs/${selectedClubId}/members/me`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: JSON.stringify({ birthDate: birthDate || undefined }),
      });
      if (!response.ok) throw new Error(await parseErrorCode(response));
      toast.success(t("updated"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH.UNKNOWN";
      toast.error(tErrors(code));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center gap-4 p-4">
      <h1 className="text-xl font-semibold">{tHeader("settings")}</h1>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("myProfileTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {clubs !== null && clubs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noClub")}</p>
          )}

          {clubs !== null && clubs.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("club")}</Label>
              <Select value={selectedClubId ?? undefined} onValueChange={setSelectedClubId}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      clubs.find((club) => String(club.id) === value)?.name ?? ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clubs.map((club) => (
                    <SelectItem key={club.id} value={String(club.id)}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedClubId && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settings-birth-date">{t("birthDate")}</Label>
                <Input
                  id="settings-birth-date"
                  type="date"
                  value={birthDate}
                  disabled={isLoadingProfile}
                  onChange={(event) => setBirthDate(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={isSubmitting || isLoadingProfile}>
                {t("save")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
