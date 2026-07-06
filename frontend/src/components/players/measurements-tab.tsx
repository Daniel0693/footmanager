"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
  type DefaultLegendContentProps,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { MEASUREMENT_TYPES, type MeasurementType } from "@/lib/measurement-type";

interface Measurement {
  id: number;
  type: MeasurementType;
  value: string;
  date: string;
}

interface ChartPoint {
  date: string;
  HEIGHT?: number;
  WEIGHT?: number;
}

type SortableColumn = "date" | "value";
type SortOrder = "asc" | "desc";

const ALL = "ALL";

// Paires validées (contraste + séparation CVD) via la skill dataviz —
// ΔE ~100 en clair et en sombre, largement au-dessus du seuil de 12.
const chartConfig: ChartConfig = {
  HEIGHT: { theme: { light: "#2a78d6", dark: "#3987e5" } },
  WEIGHT: { theme: { light: "#eb6834", dark: "#d95926" } },
};

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

function mergeForChart(measurements: Measurement[]): ChartPoint[] {
  const byDate = new Map<string, ChartPoint>();
  for (const m of measurements) {
    const day = m.date.slice(0, 10);
    const point = byDate.get(day) ?? { date: day };
    point[m.type] = Number(m.value);
    byDate.set(day, point);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function MeasurementsTab({
  clubId,
  teamId,
  playerId,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
}) {
  const t = useTranslations("measurements");
  const tType = useTranslations("measurementType");
  const { accessToken } = useAuth();

  // Filtres partagés entre le graphique et le tableau (décision du
  // 2026-07-06, voir docs/modules/effectif-joueurs.md §Mesures) — un seul
  // jeu d'état, un changement redéclenche les deux fetchs.
  const [filterType, setFilterType] = useState<MeasurementType | typeof ALL>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [chartMeasurements, setChartMeasurements] = useState<Measurement[] | null>(null);
  const [chartHasError, setChartHasError] = useState(false);

  // Le tri reste propre au tableau : le graphique est toujours chronologique.
  const [sortBy, setSortBy] = useState<SortableColumn>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [tableMeasurements, setTableMeasurements] = useState<Measurement[] | null>(null);
  const [tableHasError, setTableHasError] = useState(false);

  const [type, setType] = useState<MeasurementType>("HEIGHT");
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<{ value?: boolean; date?: boolean }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMeasurements = useCallback(
    async (params: Record<string, string | undefined>) => {
      const query = toQueryString({ teamId, ...params });
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/measurements?${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      return response.json();
    },
    [clubId, playerId, teamId, accessToken],
  );

  const loadChart = useCallback(async () => {
    try {
      const data = await fetchMeasurements({
        type: filterType === ALL ? undefined : filterType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setChartMeasurements(data);
      setChartHasError(false);
    } catch {
      setChartHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchMeasurements, filterType, dateFrom, dateTo, t]);

  const loadTable = useCallback(async () => {
    try {
      const data = await fetchMeasurements({
        type: filterType === ALL ? undefined : filterType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        sortOrder,
      });
      setTableMeasurements(data);
      setTableHasError(false);
    } catch {
      setTableHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchMeasurements, filterType, dateFrom, dateTo, sortBy, sortOrder, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMeasurements({
          type: filterType === ALL ? undefined : filterType,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        if (!cancelled) {
          setChartMeasurements(data);
          setChartHasError(false);
        }
      } catch {
        if (!cancelled) {
          setChartHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMeasurements, filterType, dateFrom, dateTo, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMeasurements({
          type: filterType === ALL ? undefined : filterType,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sortBy,
          sortOrder,
        });
        if (!cancelled) {
          setTableMeasurements(data);
          setTableHasError(false);
        }
      } catch {
        if (!cancelled) {
          setTableHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMeasurements, filterType, dateFrom, dateTo, sortBy, sortOrder, t]);

  const toggleSort = (column: SortableColumn) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // Le clic sur la légende bascule directement le filtre partagé `type`
  // (décision du 2026-07-06) : la légende n'est plus un simple masquage
  // visuel côté client, elle pilote le même état que le sélecteur "Type" de
  // la carte de filtres, donc influence aussi bien le graphique que le
  // tableau (les deux fetchs backend). Cliquer la série déjà isolée revient
  // à "Tous les types" ; cliquer l'autre série bascule l'isolement sur elle.
  const handleLegendClick = (dataKey: MeasurementType) => {
    setFilterType((prev) => (prev === dataKey ? ALL : dataKey));
  };

  const renderLegend = (props: DefaultLegendContentProps) => (
    <ul className="flex justify-center gap-4 pt-3">
      {(props.payload ?? []).map((entry) => {
        const key = entry.dataKey as MeasurementType;
        const isHidden = filterType !== ALL && filterType !== key;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => handleLegendClick(key)}
              className="flex items-center gap-1.5 text-sm"
              style={{ opacity: isHidden ? 0.4 : 1 }}
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {tType(key)}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = { value: value.trim() === "", date: date.trim() === "" };
    setErrors(nextErrors);
    if (nextErrors.value || nextErrors.date) return;

    setIsSubmitting(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/measurements?teamId=${teamId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ type, value: Number(value), date }),
        },
      );
      if (!response.ok) throw new Error();
      toast.success(t("created"));
      setValue("");
      setDate("");
      await Promise.all([loadChart(), loadTable()]);
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/measurements/${id}?teamId=${teamId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      await Promise.all([loadChart(), loadTable()]);
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const chartData = mergeForChart(chartMeasurements ?? []);

  const sortIcon = (column: SortableColumn) => {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? (
      <ArrowUp className="inline size-3.5" />
    ) : (
      <ArrowDown className="inline size-3.5" />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Filtres partagés (graphique + tableau) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("chartFiltersTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("type")}</Label>
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType((v as MeasurementType | typeof ALL) ?? ALL)}
            >
              <SelectTrigger className="w-36">
                <SelectValue>
                  {(v: string | null) => (v && v !== ALL ? tType(v) : t("allTypes"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
                {MEASUREMENT_TYPES.map((measurementType) => (
                  <SelectItem key={measurementType} value={measurementType}>
                    {tType(measurementType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-date-from">{t("dateFrom")}</Label>
            <Input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-date-to">{t("dateTo")}</Label>
            <Input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Graphique unique, deux courbes, légende cliquable */}
      <Card>
        <CardContent>
          {chartHasError ? (
            <p className="text-sm text-destructive">{t("loadFailed")}</p>
          ) : chartMeasurements === null ? null : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ChartContainer config={chartConfig}>
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend content={renderLegend} />
                <Line
                  dataKey="HEIGHT"
                  name={tType("HEIGHT")}
                  type="monotone"
                  stroke="var(--color-HEIGHT)"
                  strokeWidth={2}
                  hide={filterType !== ALL && filterType !== "HEIGHT"}
                  dot
                  connectNulls
                />
                <Line
                  dataKey="WEIGHT"
                  name={tType("WEIGHT")}
                  type="monotone"
                  stroke="var(--color-WEIGHT)"
                  strokeWidth={2}
                  hide={filterType !== ALL && filterType !== "WEIGHT"}
                  dot
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* 3. Ligne d'ajout de mesure */}
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("type")}</Label>
              <Select value={type} onValueChange={(v) => setType((v as MeasurementType) ?? "HEIGHT")}>
                <SelectTrigger className="w-36">
                  <SelectValue>{(v: string | null) => (v ? tType(v) : "")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_TYPES.map((measurementType) => (
                    <SelectItem key={measurementType} value={measurementType}>
                      {tType(measurementType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="measurement-value">{t("value")}</Label>
              <Input
                id="measurement-value"
                type="number"
                step="0.1"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              {errors.value && <p className="text-sm text-destructive">{t("valueRequired")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="measurement-date">{t("date")}</Label>
              <Input
                id="measurement-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              {errors.date && <p className="text-sm text-destructive">{t("dateRequired")}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 4. Historique triable (filtres communs à la carte du haut) */}
      <Card>
        <CardContent>
          {tableHasError ? (
            <p className="text-sm text-destructive">{t("loadFailed")}</p>
          ) : tableMeasurements === null ? null : tableMeasurements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("date")}
                      className="flex items-center gap-1"
                    >
                      {t("date")} {sortIcon("date")}
                    </button>
                  </TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => toggleSort("value")}
                      className="flex items-center gap-1"
                    >
                      {t("value")} {sortIcon("value")}
                    </button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tableMeasurements ?? []).map((measurement) => (
                  <TableRow key={measurement.id}>
                    <TableCell>{measurement.date.slice(0, 10)}</TableCell>
                    <TableCell>{tType(measurement.type)}</TableCell>
                    <TableCell>{measurement.value}</TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(measurement.id)}
                      >
                        {t("delete")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
