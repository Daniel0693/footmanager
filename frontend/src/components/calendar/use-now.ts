"use client";

import { useEffect, useState } from "react";

// Partagé entre la vue Liste (repères "aujourd'hui"/"en cours") et la vue
// Semaine (ligne d'heure actuelle) — un intervalle d'une minute suffit, ces
// deux usages n'ont pas besoin d'une précision à la seconde.
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}
