import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Version interactive de StarRating (lecture seule) : 5 étoiles, chacune
// divisée en deux zones cliquables (moitié gauche = demi-étoile, moitié
// droite = étoile pleine), pour saisir un score sur 10 par pas de 0.5
// (convention CLAUDE.md — non négociable). `label` (ex. le nom du critère)
// est inclus dans chaque `aria-label` de bouton : plusieurs instances de ce
// composant coexistent sur le même formulaire (une par critère), leurs
// libellés ne doivent pas entrer en collision.
export function StarRatingInput({
  label,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: number | undefined;
  onChange: (score: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const starsValue = value !== undefined ? value / 2 : 0;

  return (
    <span className={cn("inline-flex flex-col items-center gap-0.5", className)}>
      <span className="inline-flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map((starIndex) => {
          const fillFraction = Math.min(1, Math.max(0, starsValue - starIndex));
          const halfScore = starIndex * 2 + 1;
          const fullScore = starIndex * 2 + 2;
          return (
            <span key={starIndex} className="relative inline-block size-4">
              <Star className="absolute inset-0 size-4 text-muted-foreground" />
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fillFraction * 100}%` }}
              >
                <Star className="size-4 fill-primary text-primary" />
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${label} : ${halfScore} sur 10`}
                aria-pressed={value === halfScore}
                onClick={() => onChange(halfScore)}
                className="absolute inset-y-0 left-0 w-1/2 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label={`${label} : ${fullScore} sur 10`}
                aria-pressed={value === fullScore}
                onClick={() => onChange(fullScore)}
                className="absolute inset-y-0 right-0 w-1/2 disabled:cursor-not-allowed"
              />
            </span>
          );
        })}
      </span>
      <span className="text-xs text-muted-foreground">
        {value !== undefined ? `${value.toFixed(1)}/10` : "—"}
      </span>
    </span>
  );
}
