import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";

// Convention de notation (CLAUDE.md — non négociable) : le score est
// toujours stocké sur 10 (pas de 0.5), affiché ici en étoiles sur 5
// (score / 2, avec demi-étoiles). Les paliers de 0.5/10 donnent des quarts
// d'étoile — arrondis au demi le plus proche pour le rendu visuel ; la
// valeur exacte reste visible en texte à côté des étoiles.
export function StarRating({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const starsValue = Math.round((score / 2) * 2) / 2;
  const fullStars = Math.floor(starsValue);
  const hasHalfStar = starsValue - fullStars === 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`${score.toFixed(1)}/10`}
    >
      <span className="inline-flex items-center gap-0.5">
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star key={`full-${i}`} className="size-4 fill-primary text-primary" />
        ))}
        {hasHalfStar && (
          <StarHalf className="size-4 fill-primary text-primary" />
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star key={`empty-${i}`} className="size-4 text-muted-foreground" />
        ))}
      </span>
      <span className="text-xs text-muted-foreground">{score.toFixed(1)}/10</span>
    </span>
  );
}
