"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";

export default function HomePage() {
  const t = useTranslations("home");
  const { user, accessToken, logout } = useAuth();
  const [isCreatingClub, setIsCreatingClub] = useState(false);

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
      toast.success(t("clubCreated"));
    } catch {
      toast.error(t("clubCreationFailed"));
    } finally {
      setIsCreatingClub(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("welcome", { email: user?.email ?? "" })}</h1>
      <Button onClick={handleCreateClub} disabled={isCreatingClub}>
        {t("createClub")}
      </Button>
      <Button variant="outline" onClick={() => logout()}>
        {t("logout")}
      </Button>
    </div>
  );
}
