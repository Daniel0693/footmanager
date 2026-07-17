"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { playerInitials } from "@/lib/player-initials";
import type { FormationLine, FormationSlot } from "@/lib/formations";

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
  isCaptain: boolean;
}

interface DragState {
  playerId: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const DRAG_THRESHOLD = 6;

const LINE_LABEL_KEYS: Record<FormationLine, string> = {
  GK: "lineGK",
  DEF: "lineDEF",
  MID: "lineMID",
  FWD: "lineFWD",
};

const label = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

// Glisser-déposer fait maison (Pointer Events, aucune dépendance) avec repli
// clic (sélectionner un joueur puis cliquer sa destination) pour le clavier/
// accessibilité et pour les tests (jsdom n'implémente pas
// `elementFromPoint`, utilisé uniquement pour le hit-testing du drag réel).
// État centralisé dans ce hook — plutôt que dans le terrain lui-même —
// pour que le terrain et le banc puissent être placés dans deux colonnes
// séparées (docs/modules/matchs.md §Composition, B6/B7) tout en partageant
// la même sélection/le même geste de glisser. `slots` vient de la formation
// choisie (Match.formation, B8) — plus un référentiel de points fixe.
//
// Suivi du geste via des écouteurs `window` posés au `pointerdown` (retirés
// au relâchement/à l'annulation) plutôt que `onPointerMove`/`onPointerUp`
// posés sur chaque élément + `setPointerCapture` (B9, retour utilisateur du
// 2026-07-17 : glisser-déposer peu fiable entre deux points du terrain) —
// un seul point d'écoute global, indépendant de la capture de pointeur et
// de la frontière DOM banc/SVG, plus robuste.
export function usePitchInteractions({
  slots,
  placedPlayers,
  canManage,
  onPlace,
  onUnplace,
}: {
  slots: FormationSlot[];
  placedPlayers: PlacedPlayer[];
  canManage: boolean;
  onPlace: (playerId: number, spot: FormationSlot) => void;
  onUnplace: (playerId: number) => void;
}) {
  const t = useTranslations("matchComposition");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);
  const [hoveredBench, setHoveredBench] = useState(false);
  const dragState = useRef<DragState | null>(null);
  const cleanupDragListeners = useRef<(() => void) | null>(null);

  const placedBySpot = new Map(placedPlayers.map((p) => [p.spotId, p]));
  const placedByPlayerId = new Map(placedPlayers.map((p) => [p.playerId, p]));

  const tryPlace = (playerId: number, spot: FormationSlot) => {
    const occupant = placedBySpot.get(spot.id);
    if (occupant && occupant.playerId !== playerId) {
      toast.error(t("spotOccupied", { player: label(occupant) }));
      return;
    }
    onPlace(playerId, spot);
  };

  // `endDrag` (déclenché par le pointerup global) et les gestionnaires
  // `onClick` se partagent la même geste physique (pointerdown → pointerup
  // → click, dans cet ordre) : quand un vrai glisser a eu lieu, `endDrag`
  // traite déjà le dépôt et pose ce drapeau pour que le `click` qui suit
  // immédiatement ne rejoue pas la même action (sélection en double, dépôt
  // en double...).
  const suppressClickRef = useRef(false);
  const consumeSuppressedClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  };

  const resetDragVisuals = () => {
    setDraggingPlayerId(null);
    setDragPosition(null);
    setHoveredSpotId(null);
    setHoveredBench(false);
  };

  const handlePointerDown = (playerId: number, event: React.PointerEvent) => {
    if (!canManage) return;
    cleanupDragListeners.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    dragState.current = { playerId, pointerId, startX, startY, moved: false };

    const onMove = (moveEvent: PointerEvent) => {
      const state = dragState.current;
      if (!state || state.pointerId !== moveEvent.pointerId) return;
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        state.moved = true;
        setDraggingPlayerId(state.playerId);
      }
      if (state.moved) {
        setDragPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const spotEl = el?.closest<HTMLElement>("[data-spot-id]");
        setHoveredSpotId(spotEl?.dataset.spotId ?? null);
        setHoveredBench(!spotEl && !!el?.closest("[data-bench-zone]"));
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
      const state = dragState.current;
      dragState.current = null;
      resetDragVisuals();
      if (!state || !state.moved) return; // pas de glisser : le `click` natif prend le relais

      suppressClickRef.current = true;
      const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      const spotEl = el?.closest<HTMLElement>("[data-spot-id]");
      const benchEl = el?.closest<HTMLElement>("[data-bench-zone]");
      if (spotEl) {
        const spot = slots.find((s) => s.id === spotEl.dataset.spotId);
        if (spot) tryPlace(state.playerId, spot);
      } else if (benchEl && placedByPlayerId.has(state.playerId)) {
        onUnplace(state.playerId);
      }
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      cleanup();
      dragState.current = null;
      resetDragVisuals();
    };

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      cleanupDragListeners.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    cleanupDragListeners.current = cleanup;
  };

  const handleSpotClick = (spot: FormationSlot) => {
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

  const clearSelection = () => setSelectedPlayerId(null);

  const draggingLabel = draggingPlayerId !== null
    ? (placedByPlayerId.get(draggingPlayerId) ?? null)
    : null;

  return {
    selectedPlayerId,
    draggingPlayerId,
    dragPosition,
    hoveredSpotId,
    hoveredBench,
    draggingLabel: draggingLabel ? label(draggingLabel) : null,
    placedBySpot,
    placedByPlayerId,
    handlePointerDown,
    handleSpotClick,
    handleBenchChipClick,
    handleBenchZoneClick,
    clearSelection,
  };
}

export type PitchInteractions = ReturnType<typeof usePitchInteractions>;

// Terrain SVG (docs/modules/matchs.md §Composition, B6/B8/B9) — piloté par
// la formation choisie (`slots`, voir lib/formations.ts) plutôt qu'un
// référentiel de points fixe partagé avec la fiche joueur. Dimensionné par
// la hauteur disponible (`h-full`, `aspect-square` pour garder le viewBox
// carré) plutôt que par la largeur de sa colonne (`max-w-xs` en B7) : trop
// petit une fois la largeur de colonne réduite en B7 — le conteneur parent
// (CompositionColumn) doit fournir une hauteur bornée (`min-h-0`/`flex-1`)
// pour que `h-full` ait un sens (retour utilisateur du 2026-07-17).
export function PitchSvg({
  slots,
  canManage,
  interactions,
}: {
  slots: FormationSlot[];
  canManage: boolean;
  interactions: PitchInteractions;
}) {
  const t = useTranslations("matchComposition");
  const {
    selectedPlayerId,
    draggingPlayerId,
    dragPosition,
    hoveredSpotId,
    draggingLabel,
    placedBySpot,
    handlePointerDown,
    handleSpotClick,
  } = interactions;
  const draggingOccupant = draggingPlayerId !== null ? interactions.placedByPlayerId.get(draggingPlayerId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-2">
      <svg
        viewBox="0 0 100 100"
        role="group"
        aria-label={t("pitchLabel")}
        className="aspect-square h-full max-h-full w-auto touch-none rounded-md bg-emerald-600 select-none dark:bg-emerald-800"
        preserveAspectRatio="xMidYMid meet"
      >
        <g stroke="white" strokeOpacity={0.6} strokeWidth={0.5} fill="none">
          <rect x={2} y={2} width={96} height={96} />
          <line x1={2} y1={50} x2={98} y2={50} />
          <circle cx={50} cy={50} r={9} />
          <rect x={26} y={2} width={48} height={16} />
          <rect x={26} y={82} width={48} height={16} />
        </g>

        {slots.map((spot) => {
          const occupant = placedBySpot.get(spot.id);
          const isBeingDragged = occupant && occupant.playerId === draggingPlayerId;
          const isSelected = occupant && occupant.playerId === selectedPlayerId;
          const isHovered = hoveredSpotId === spot.id;
          const isBlocked = isHovered && occupant && occupant.playerId !== draggingPlayerId && draggingPlayerId !== null;
          const lineLabel = t(LINE_LABEL_KEYS[spot.line]);
          const initials = occupant ? playerInitials(occupant.firstName, occupant.lastName) : null;

          return (
            <g
              key={spot.id}
              data-spot-id={spot.id}
              role="button"
              tabIndex={canManage ? 0 : -1}
              aria-label={occupant ? `${lineLabel} — ${label(occupant)}` : lineLabel}
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
                r={7.2}
                className={cn(
                  "stroke-white transition-colors",
                  occupant ? "fill-blue-600" : "fill-emerald-900/40",
                  isSelected && "stroke-amber-300",
                  isHovered && !occupant && "fill-emerald-500",
                  isBlocked && "fill-red-600",
                )}
                strokeWidth={isSelected || isHovered ? 1.2 : 0.6}
              />
              {occupant ? (
                <>
                  <text
                    x={spot.x}
                    y={initials && occupant.shirtNumber !== null ? spot.y - 1.6 : spot.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none fill-white font-sans font-medium"
                    style={{ fontSize: 3.6 }}
                  >
                    {initials}
                  </text>
                  {occupant.shirtNumber !== null && (
                    <text
                      x={spot.x}
                      y={spot.y + 2.6}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="pointer-events-none fill-white/80 font-sans"
                      style={{ fontSize: 2.8 }}
                    >
                      #{occupant.shirtNumber}
                    </text>
                  )}
                </>
              ) : (
                <text
                  x={spot.x}
                  y={spot.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none fill-white font-sans"
                  style={{ fontSize: 4.5 }}
                >
                  {lineLabel}
                </text>
              )}
              {occupant?.isCaptain && (
                <g transform={`translate(${spot.x + 5}, ${spot.y - 5})`}>
                  <circle r={2.6} className="fill-amber-400 stroke-emerald-900" strokeWidth={0.4} />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none fill-emerald-950 font-bold"
                    style={{ fontSize: 3.2 }}
                  >
                    C
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {draggingPlayerId !== null && dragPosition && draggingLabel && (
        <div
          className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-blue-600 py-1 pr-3 pl-1 text-xs font-medium text-white shadow-lg ring-2 ring-white"
          style={{ left: dragPosition.x, top: dragPosition.y }}
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-blue-700 text-[0.65rem] font-semibold">
            {draggingOccupant ? playerInitials(draggingOccupant.firstName, draggingOccupant.lastName) : ""}
          </span>
          {draggingLabel}
        </div>
      )}
    </div>
  );
}

// Banc — joueurs disponibles pour la composition, dans sa propre colonne
// (retour utilisateur du 2026-07-17 : perdu en bas d'un terrain trop grand
// dans une version précédente). Liste compacte (avatar + nom), même style
// que les colonnes Convocations/Titulaires (celle-ci retirée en B8), plutôt
// que des pastilles au fil du texte — plus lisible dans une colonne étroite
// dédiée.
export function BenchList({
  benchPlayers,
  canManage,
  interactions,
}: {
  benchPlayers: BenchPlayer[];
  canManage: boolean;
  interactions: PitchInteractions;
}) {
  const t = useTranslations("matchComposition");
  const { selectedPlayerId, draggingPlayerId, hoveredBench, handlePointerDown } = interactions;

  if (!canManage) return null;

  return (
    <div
      data-bench-zone
      onClick={interactions.handleBenchZoneClick}
      className={cn(
        "flex min-h-16 flex-col divide-y divide-border overflow-hidden rounded-xl border-2 border-dashed border-border transition-colors",
        selectedPlayerId !== null && "border-amber-400",
        hoveredBench && "border-blue-500 bg-blue-500/5",
      )}
    >
      {benchPlayers.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{t("benchEmpty")}</p>
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
              onClick={(event) => {
                event.stopPropagation();
                interactions.handleBenchChipClick(player.playerId);
              }}
              className={cn(
                "flex touch-none items-center gap-2 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                isSelected && "bg-amber-400/10 ring-1 ring-inset ring-amber-400",
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
  );
}
