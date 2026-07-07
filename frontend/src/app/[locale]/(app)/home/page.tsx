"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

interface MyClub {
  id: number;
  name: string;
}

export default function HomePage() {
  const t = useTranslations("home");
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const [isCreatingClub, setIsCreatingClub] = useState(false);
  const [myClubs, setMyClubs] = useState<MyClub[] | null>(null);

  const loadMyClubs = useCallback(async () => {
    try {
      const response = await apiFetch("/clubs", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error();
      setMyClubs(await response.json());
    } catch {
      setMyClubs([]);
    }
  }, [accessToken]);

  useEffect(() => {
    // Bootstrap volontaire : charge les clubs du compte connecté au montage
    // — cas d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMyClubs();
  }, [loadMyClubs]);

  const handleCreateClub = async () => {
    if (!user) return;
    setIsCreatingClub(true);
    try {
      const response = await apiFetch("/clubs", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: t("demoClubName"),
          country: "France",
          firstName: user.email.split("@")[0],
          lastName: "-",
        }),
      });
      if (!response.ok) throw new Error();
      const club = await response.json();
      toast.success(t("clubCreated"));
      router.push(`/clubs/${club.id}/teams`);
    } catch {
      toast.error(t("clubCreationFailed"));
    } finally {
      setIsCreatingClub(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("welcome", { email: user?.email ?? "" })}</h1>

      {myClubs !== null && myClubs.length === 0 && (
        <Button onClick={handleCreateClub} disabled={isCreatingClub}>
          {t("createClub")}
        </Button>
      )}

      {myClubs?.map((club) => (
        <Button
          key={club.id}
          variant="secondary"
          nativeButton={false}
          render={<Link href={`/clubs/${club.id}/teams`} />}
        >
          {t("viewClub", { clubName: club.name })}
        </Button>
      ))}
    </div>
  );
}
