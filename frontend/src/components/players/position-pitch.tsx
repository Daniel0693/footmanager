"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { POSITION_PITCH_SPOTS, type Position } from "@/lib/positions";

type Mode = "main" | "secondary";

export function PositionPitch({
  mainPosition,
  secondaryPositions,
  onSelectMain,
  onToggleSecondary,
  disabled = false,
}: {
  mainPosition: Position | null;
  secondaryPositions: Position[];
  onSelectMain: (position: Position | null) => void;
  onToggleSecondary: (position: Position) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("playerDetail");
  const tPositions = useTranslations("positions");
  const tPositionAbbreviations = useTranslations("positionAbbreviations");
  const [mode, setMode] = useState<Mode>("main");

  const handleClick = (position: Position) => {
    if (disabled) return;
    if (mode === "main") {
      onSelectMain(mainPosition === position ? null : position);
      return;
    }
    if (position === mainPosition) return; // pas de doublon principal/secondaire
    onToggleSecondary(position);
  };

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
        <TabsList>
          <TabsTrigger value="main">{t("positionsMain")}</TabsTrigger>
          <TabsTrigger value="secondary">{t("positionsOther")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <svg
        viewBox="0 0 100 100"
        role="group"
        aria-label={t("positions")}
        className="w-full rounded-md bg-emerald-600 dark:bg-emerald-800"
      >
        <g stroke="white" strokeOpacity={0.6} strokeWidth={0.5} fill="none">
          <rect x={2} y={2} width={96} height={96} />
          <line x1={2} y1={50} x2={98} y2={50} />
          <circle cx={50} cy={50} r={9} />
          <rect x={26} y={2} width={48} height={16} />
          <rect x={26} y={82} width={48} height={16} />
        </g>

        {POSITION_PITCH_SPOTS.map((spot) => {
          const isMain = mainPosition === spot.position;
          const isSecondary = secondaryPositions.includes(spot.position);
          const isDisabledSpot = mode === "secondary" && isMain;

          return (
            <g
              key={spot.id}
              role="button"
              tabIndex={isDisabledSpot || disabled ? -1 : 0}
              aria-label={tPositions(spot.position)}
              aria-pressed={isMain || isSecondary}
              aria-disabled={isDisabledSpot || disabled}
              onClick={() => !isDisabledSpot && handleClick(spot.position)}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !isDisabledSpot) {
                  event.preventDefault();
                  handleClick(spot.position);
                }
              }}
              className={cn(
                "cursor-pointer outline-none",
                isDisabledSpot && "cursor-not-allowed opacity-40",
                disabled && "cursor-wait",
              )}
            >
              <circle
                cx={spot.x}
                cy={spot.y}
                r={6.5}
                className={cn(
                  "stroke-white transition-colors",
                  isMain
                    ? "fill-blue-600"
                    : isSecondary
                      ? "fill-orange-500"
                      : "fill-emerald-900/40 hover:fill-emerald-900/70",
                )}
                strokeWidth={0.6}
              />
              <text
                x={spot.x}
                y={spot.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none fill-white font-sans"
                style={{ fontSize: 4.5 }}
              >
                {tPositionAbbreviations(spot.position)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-2">
        {mainPosition ? (
          <Badge className="bg-blue-600">{tPositions(mainPosition)}</Badge>
        ) : null}
        {secondaryPositions.map((position) => (
          <Badge key={position} className="bg-orange-500">
            {tPositions(position)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
