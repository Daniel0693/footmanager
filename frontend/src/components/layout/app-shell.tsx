"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { SidebarNav } from "./sidebar-nav";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <SiteHeader onToggleSidebar={() => setSidebarOpen((open) => !open)} />
        {/* Seul <main> défile : le header et la sidebar restent fixes à
            l'écran, et les pages qui gèrent leur propre scroll interne
            (ex. timelines Objectifs/Entretien/Notes) reçoivent une hauteur
            disponible réelle (min-h-0) plutôt qu'une croissance illimitée. */}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
