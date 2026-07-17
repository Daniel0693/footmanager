"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { playerInitials } from "@/lib/player-initials";
import { POSITION_PITCH_SPOTS, type PositionPitchSpot } from "@/lib/positions";

export interface BenchPlayer {
  playerId: number;
  firstName: string;
  lastName: string;
}

export interface PlacedPlayer {
  playerId: number;
  firstName: string;
  lastName: string;
  spotId: string;
  shirtNumber: number | null;
}

interface DragState {
  playerId: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 6;

// Terrain SVG interactif (docs/modules/matchs.md §Composition, B6) — glisser-
// déposer fait maison (Pointer Events, aucune dépendance) avec repli clic
// (sélectionner un joueur puis cliquer sa destination) pour le clavier/
// accessibilité et pour les tests (jsdom n'implémente pas
// `elementFromPoint`, utilisé uniquement pour le hit-testing du drag réel).
// Réutilise POSITION_PITCH_SPOTS (même terrain que la fiche joueur,
// components/players/position-pitch.tsx) — aucune coordonnée dupliquée.
export function LineupPitch({
  benchPlayers,
  placedPlayers,
  canManage,
  onPlace,
  onUnplace,
}: {
  benchPlayers: BenchPlayer[];
  placedPlayers: PlacedPlayer[];
  canManage: boolean;
  onPlace: (playerId: number, spot: PositionPitchSpot) => void;
  onUnplace: (playerId: number) => void;
}) {
  const t = useTranslations("matchComposition");
  const tPositions = useTranslations("positions");
  const tAbbrev = useTranslations("positionAbbreviations");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);
  const dragState = useRef<DragState | null>(null);

  const placedBySpot = new Map(placedPlayers.map((p) => [p.spotId, p]));
  const placedByPlayerId = new Map(placedPlayers.map((p) => [p.playerId, p]));
  const label = (p: { firstName: string; lastName: string }) =>
    `${p.firstName} ${p.lastName}`;

  const tryPlace = (playerId: number, spot: PositionPitchSpot) => {
    const occupant = placedBySpot.get(spot.id);
    if (occupant && occupant.playerId !== playerId) {
      toast.error(t("spotOccupied", { player: label(occupant) }));
      return;
    }
    onPlace(playerId, spot);
  };

  // `endDrag` et les gestionnaires `onClick` se partagent la même geste
  // physique (pointerdown → pointerup → click, dans cet ordre) : quand un
  // vrai glisser a eu lieu, `endDrag` traite déjà le dépôt et pose ce drapeau
  // pour que le `click` qui suit immédiatement ne rejoue pas la même action
  // (sélection en double, dépôt en double...).
  const suppressClickRef = useRef(false);
  const consumeSuppressedClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  };

  const handlePointerDown = (playerId: number, event: React.PointerEvent) => {
    if (!canManage) return;
    // jsdom (tests) n'implémente pas setPointerCapture — sans effet sur le
    // repli clic, seul le drag réel en navigateur en a besoin.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragState.current = {
      playerId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const state = dragState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      state.moved = true;
      setDraggingPlayerId(state.playerId);
    }
    if (state.moved) {
      setDragPosition({ x: event.clientX, y: event.clientY });
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const spotEl = el?.closest<HTMLElement>("[data-spot-id]");
      setHoveredSpotId(spotEl?.dataset.spotId ?? null);
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    const state = dragState.current;
    dragState.current = null;
    setDraggingPlayerId(null);
    setDragPosition(null);
    setHoveredSpotId(null);
    // Pas de mouvement significatif : ce n'était pas un glisser, on laisse le
    // `click` natif qui suit gérer la sélection/le dépôt (repli clic).
    if (!state || state.pointerId !== event.pointerId || !state.moved) return;

    suppressClickRef.current = true;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const spotEl = el?.closest<HTMLElement>("[data-spot-id]");
    const benchEl = el?.closest<HTMLElement>("[data-bench-zone]");
    if (spotEl) {
      const spot = POSITION_PITCH_SPOTS.find((s) => s.id === spotEl.dataset.spotId);
      if (spot) tryPlace(state.playerId, spot);
    } else if (benchEl && placedByPlayerId.has(state.playerId)) {
      onUnplace(state.playerId);
    }
  };

  const handleSpotClick = (spot: PositionPitchSpot) => {
    if (!canManage || consumeSuppressedClick()) return;
    const occupant = placedBySpot.get(spot.id);
    if (selectedPlayerId !== null) {
      if (occupant?.playerId === selectedPlayerId) {
        setSelectedPlayerId(null); // re-clic sur le joueur déjà sélectionné : désélectionne
        return;
      }
      tryPlace(selectedPlayerId, spot);
      setSelectedPlayerId(null);
      return;
    }
    if (occupant) setSelectedPlayerId(occupant.playerId);
  };

  const handleBenchChipClick = (playerId: number) => {
    if (!canManage || consumeSuppressedClick()) return;
    setSelectedPlayerId((current) => (current === playerId ? null : playerId));
  };

  const handleBenchZoneClick = () => {
    if (!canManage || consumeSuppressedClick()) return;
    if (selectedPlayerId !== null && placedByPlayerId.has(selectedPlayerId)) {
      onUnplace(selectedPlayerId);
    }
    setSelectedPlayerId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox="0 0 100 100"
        role="group"
        aria-label={t("pitchLabel")}
        className="w-full touch-none rounded-md bg-emerald-600 select-none dark:bg-emerald-800"
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g stroke="white" strokeOpacity={0.6} strokeWidth={0.5} fill="none">
          <rect x={2} y={2} width={96} height={96} />
          <line x1={2} y1={50} x2={98} y2={50} />
          <circle cx={50} cy={50} r={9} />
          <rect x={26} y={2} width={48} height={16} />
          <rect x={26} y={82} width={48} height={16} />
        </g>

        {POSITION_PITCH_SPOTS.map((spot) => {
          const occupant = placedBySpot.get(spot.id);
          const isBeingDragged = occupant && occupant.playerId === draggingPlayerId;
          const isSelected = occupant && occupant.playerId === selectedPlayerId;
          const isHovered = hoveredSpotId === spot.id;

          return (
            <g
              key={spot.id}
              data-spot-id={spot.id}
              role="button"
              tabIndex={canManage ? 0 : -1}
              aria-label={
                occupant
                  ? `${tPositions(spot.position)} — ${label(occupant)}`
                  : tPositions(spot.position)
              }
              aria-pressed={!!isSelected}
              onPointerDown={
                occupant ? (event) => handlePointerDown(occupant.playerId, event) : undefined
              }
              onClick={() => handleSpotClick(spot)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSpotClick(spot);
                }
              }}
              className={cn(
                "outline-none",
                canManage && "cursor-pointer",
                isBeingDragged && "opacity-30",
              )}
            >
              <circle
                cx={spot.x}
                cy={spot.y}
                r={6.5}
                className={cn(
                  "stroke-white transition-colors",
                  occupant ? "fill-blue-600" : "fill-emerald-900/40",
                  isSelected && "stroke-amber-300",
                  isHovered && !occupant && "fill-emerald-900/70",
                )}
                strokeWidth={isSelected ? 1.2 : 0.6}
              />
              <text
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none fill-white font-sans"
                style={{ fontSize: 4.5 }}
              >
                {occupant
                  ? (occupant.shirtNumber ?? playerInitials(occupant.firstName, occupant.lastName))
                  : tAbbrev(spot.position)}
              </text>
            </g>
          );
        })}
      </svg>

      {draggingPlayerId !== null && dragPosition && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{ left: dragPosition.x, top: dragPosition.y }}
        >
          {(() => {
            const p = placedByPlayerId.get(draggingPlayerId);
            return p ? label(p) : "";
          })()}
        </div>
      )}

      {canManage && (
        <div
          data-bench-zone
          onClick={handleBenchZoneClick}
          className={cn(
            "flex min-h-16 flex-wrap gap-2 rounded-lg border-2 border-dashed border-border p-2",
            selectedPlayerId !== null && "border-amber-400",
          )}
        >
          {benchPlayers.length === 0 ? (
            <p className="flex items-center px-2 text-sm text-muted-foreground">
              {t("benchEmpty")}
            </p>
          ) : (
            benchPlayers.map((player) => {
              const isSelected = selectedPlayerId === player.playerId;
              const isBeingDragged = draggingPlayerId === player.playerId;
              return (
                <button
                  key={player.playerId}
                  type="button"
                  aria-pressed={isSelected}
                  onPointerDown={(event) => handlePointerDown(player.playerId, event)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleBenchChipClick(player.playerId);
                  }}
                  className={cn(
                    "flex touch-none cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm transition-colors hover:bg-muted",
                    isSelected && "border-amber-400 ring-1 ring-amber-400",
                    isBeingDragged && "opacity-30",
                  )}
                >
                  <Avatar className="size-6" aria-hidden="true">
                    <AvatarFallback className="text-[0.65rem]">
                      {playerInitials(player.firstName, player.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  {label(player)}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
