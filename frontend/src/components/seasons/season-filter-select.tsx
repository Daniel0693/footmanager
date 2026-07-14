"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, authHeaders } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { SeasonStatus } from "@/lib/season-status";

interface SeasonOption {
  id: number;
  name: string;
  status: SeasonStatus;
}

const CUSTOM_RANGE = "custom";

// Filtrage rétroactif par saison des 5 entités A7.x (docs/schema/joueurs.md
// §Filtrage des statistiques par période, A12) — sélecteur partagé affiché
// une seule fois au-dessus des onglets de la fiche joueur, propage seasonId
// aux 4 onglets concernés (Mesures exclu, toujours vue complète). Saisons
// club-wide depuis la révision A14 (docs/roadmap.md) : plus de teamId, une
// seule liste pour tout le club. "Période personnalisée" rend la main aux
// filtres dateFrom/dateTo déjà existants de chaque onglet — mutuellement
// exclusif avec le filtre par saison, jamais les deux actifs en même temps.
export function SeasonFilterSelect({
  clubId,
  onSeasonChange,
}: {
  clubId: string;
  onSeasonChange: (seasonId: number | null) => void;
}) {
  const t = useTranslations("seasonFilter");
  const { accessToken } = useAuth();
  const [seasons, setSeasons] = useState<SeasonOption[] | null>(null);
  const [value, setValue] = useState<string>(CUSTOM_RANGE);

  const loadSeasons = useCallback(async () => {
    try {
      const response = await apiFetch(`/clubs/${clubId}/seasons`, {
        headers: authHeaders(accessToken),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as SeasonOption[];
      setSeasons(data);
      // Valeur par défaut = saison ACTIVE du club (docs/modules/
      // saisons-championnats.md) — repli sur "Période personnalisée" si
      // aucune saison active (club jamais passé par la création de saison).
      const active = data.find((season) => season.status === "ACTIVE");
      if (active) {
        setValue(String(active.id));
        onSeasonChange(active.id);
      }
    } catch {
      toast.error(t("loadFailed"));
    }
    // onSeasonChange volontairement absent des deps : appelé une seule fois
    // au chargement initial pour poser la valeur par défaut, pas à chaque
    // rendu du parent (qui recrée la fonction sans être mémoïsée).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, accessToken, t]);

  useEffect(() => {
    // Bootstrap volontaire : charge les saisons du club au montage — cas
    // d'usage légitime d'un effect (pas un état dérivable du rendu).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSeasons();
  }, [loadSeasons]);

  const handleChange = (next: string | null) => {
    const resolved = next ?? CUSTOM_RANGE;
    setValue(resolved);
    onSeasonChange(resolved === CUSTOM_RANGE ? null : Number(resolved));
  };

  if (seasons === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="w-56" aria-label={t("label")}>
          <SelectValue>
            {(v: string | null) =>
              v === CUSTOM_RANGE || !v
                ? t("customRange")
                : (seasons.find((season) => String(season.id) === v)?.name ??
                  t("customRange"))
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {seasons.map((season) => (
            <SelectItem key={season.id} value={String(season.id)}>
              {season.name}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_RANGE}>{t("customRange")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
