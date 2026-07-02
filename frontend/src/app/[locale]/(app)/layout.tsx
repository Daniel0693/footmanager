"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return null;
  }

  return <>{children}</>;
}
