"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { apiFetch, authHeaders, parseErrorCode } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import { FEET, type Foot } from "@/lib/foot";
import { GENDERS, type Gender } from "@/lib/gender";
import { POSITIONS, type Position } from "@/lib/positions";

const IGNORE = "IGNORE";

const TARGET_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "gender",
  "birthDate",
  "jerseyNumber",
  "mainPosition",
  "joinDate",
  "licenseNumber",
  "nationality",
  "preferredFoot",
] as const;
type TargetField = (typeof TARGET_FIELDS)[number];
type ColumnMapping = TargetField | typeof IGNORE;

interface ImportRowPayload {
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: Gender;
  birthDate?: string;
  jerseyNumber?: number;
  mainPosition?: Position;
  joinDate?: string;
  licenseNumber?: string;
  nationality?: string;
  preferredFoot?: Foot;
}

interface PlayerMatchAssignment {
  id: number;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
}

interface PlayerMatchCandidate {
  playerId: number;
  memberId: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  licenseNumber: string | null;
  activeAssignmentInTeam: PlayerMatchAssignment | null;
  lastAssignment: PlayerMatchAssignment | null;
  activeTeamsElsewhere: { teamId: number; teamName: string }[];
}

type PlayerMatchStatus = "NEW" | "MODIFICATION" | "REACTIVATION" | "AMBIGUOUS";

interface ImportRowPreview {
  index: number;
  status: PlayerMatchStatus;
  candidates: PlayerMatchCandidate[];
}

interface PreviewRowState {
  payload: ImportRowPayload;
  status: PlayerMatchStatus;
  candidates: PlayerMatchCandidate[];
  included: boolean;
  // REACTIVATION uniquement : true = décliner (créer un nouveau joueur).
  declined: boolean;
  // AMBIGU uniquement : playerId choisi, "NEW" pour "aucun ne correspond",
  // null tant que l'utilisateur n'a rien choisi (bloque la validation).
  ambiguousChoice: number | typeof IGNORE | null;
}

type Step = "upload" | "mapping" | "preview";

// Ne sert qu'au pré-remplissage (best-effort) du mapping colonne → champ ;
// jamais affiché à l'utilisateur (pas une chaîne d'UI, voir CLAUDE.md i18n) —
// l'utilisateur confirme ou corrige toujours manuellement à l'étape 2.
const FIELD_HEADER_ALIASES: Record<TargetField, string[]> = {
  firstName: ["PRENOM", "PRENOMS", "FIRSTNAME", "FIRST NAME"],
  lastName: ["NOM", "NOM DE FAMILLE", "LASTNAME", "LAST NAME"],
  phone: ["TELEPHONE", "TEL", "PHONE", "MOBILE"],
  gender: ["GENRE", "SEXE", "GENDER"],
  birthDate: ["DATE DE NAISSANCE", "NAISSANCE", "BIRTHDATE", "BIRTH DATE", "DOB"],
  jerseyNumber: ["NUMERO", "N", "N.", "MAILLOT", "JERSEY", "JERSEY NUMBER"],
  mainPosition: ["POSTE", "POSTE PRINCIPAL", "POSITION", "MAIN POSITION"],
  joinDate: ["DATE ARRIVEE", "DATE D'ARRIVEE", "ARRIVEE", "JOIN DATE"],
  licenseNumber: ["LICENCE", "N LICENCE", "LICENSE", "LICENSE NUMBER"],
  nationality: ["NATIONALITE", "NATIONALITY"],
  preferredFoot: ["PIED FORT", "PIED", "FOOT", "PREFERRED FOOT"],
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function guessFieldForHeader(header: string): ColumnMapping {
  const normalized = normalizeToken(header);
  for (const field of TARGET_FIELDS) {
    if (FIELD_HEADER_ALIASES[field].includes(normalized)) return field;
  }
  return IGNORE;
}

// Associe chaque valeur d'un enum à sa forme brute ET à son libellé traduit
// (réutilise les traductions déjà existantes, gender/positions/foot, plutôt
// que de dupliquer un dictionnaire d'alias par langue) — permet à un fichier
// contenant "Homme"/"Défenseur central"/"Gauche" d'être reconnu aussi bien
// qu'un fichier contenant les codes bruts "MALE"/"CB"/"LEFT".
function buildAliasMap<T extends string>(
  codes: readonly T[],
  translate: (code: T) => string,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const code of codes) {
    map.set(normalizeToken(code), code);
    map.set(normalizeToken(translate(code)), code);
  }
  return map;
}

function toTextOrUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function toIsoDateOrUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const frenchMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (frenchMatch) {
    const [, day, month, year] = frenchMatch;
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

function toJerseyNumberOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

// Import fichier (D2+D4+D6, docs/modules/effectif-joueurs.md §Import) :
// assistant en 3 étapes — upload, mapping des colonnes, prévisualisation avec
// décision par ligne — au-dessus des trois endpoints backend déjà en place
// (parse/preview/commit, C1/C3/C5).
export function ImportPlayersDialog({
  clubId,
  teamId,
  trigger,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  trigger: ReactElement;
  onSuccess: () => void;
}) {
  const t = useTranslations("importPlayers");
  const tErrors = useTranslations("errors");
  const tGender = useTranslations("gender");
  const tPositions = useTranslations("positions");
  const tFoot = useTranslations("foot");
  const { accessToken } = useAuth();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);

  const [previewRows, setPreviewRows] = useState<PreviewRowState[]>([]);

  const genderAliases = useMemo(() => buildAliasMap(GENDERS, tGender), [tGender]);
  const positionAliases = useMemo(
    () => buildAliasMap(POSITIONS, tPositions),
    [tPositions],
  );
  const footAliases = useMemo(() => buildAliasMap(FEET, tFoot), [tFoot]);

  const resetAll = () => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMapping([]);
    setPreviewRows([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetAll();
  };

  const handleError = async (response: Response) => {
    const code = await parseErrorCode(response);
    toast.error(tErrors(code));
  };

  const handleAnalyzeFile = async () => {
    if (!file) return;
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/roster/import/parse`,
        { method: "POST", headers: authHeaders(accessToken), body: formData },
      );
      if (!response.ok) {
        await handleError(response);
        return;
      }
      const parsed = (await response.json()) as { headers: string[]; rows: string[][] };
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(parsed.headers.map(guessFieldForHeader));
      setStep("mapping");
    } catch {
      toast.error(tErrors("AUTH.UNKNOWN"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleMappingChange = (columnIndex: number, field: ColumnMapping) => {
    setMapping((prev) =>
      prev.map((current, index) => {
        if (index === columnIndex) return field;
        // Un champ ne peut être associé qu'à une seule colonne à la fois —
        // la colonne qui l'utilisait déjà repasse à "Ignorer" plutôt que de
        // bloquer avec une erreur de validation.
        return field !== IGNORE && current === field ? IGNORE : current;
      }),
    );
  };

  const mappedFields = new Set(mapping.filter((field) => field !== IGNORE));
  const canContinueMapping =
    mappedFields.has("firstName") && mappedFields.has("lastName");

  const buildPayload = (rawRow: string[]): ImportRowPayload | null => {
    const get = (field: TargetField): string => {
      const columnIndex = mapping.findIndex((mapped) => mapped === field);
      return columnIndex === -1 ? "" : (rawRow[columnIndex] ?? "");
    };
    const firstName = get("firstName").trim();
    const lastName = get("lastName").trim();
    if (!firstName || !lastName) return null;

    return {
      firstName,
      lastName,
      phone: toTextOrUndefined(get("phone")),
      gender: genderAliases.get(normalizeToken(get("gender"))),
      birthDate: toIsoDateOrUndefined(get("birthDate")),
      jerseyNumber: toJerseyNumberOrUndefined(get("jerseyNumber")),
      mainPosition: positionAliases.get(normalizeToken(get("mainPosition"))),
      joinDate: toIsoDateOrUndefined(get("joinDate")),
      licenseNumber: toTextOrUndefined(get("licenseNumber")),
      nationality: toTextOrUndefined(get("nationality")),
      preferredFoot: footAliases.get(normalizeToken(get("preferredFoot"))),
    };
  };

  const handleContinueToPreview = async () => {
    const payloads: ImportRowPayload[] = [];
    let blankCount = 0;
    let invalidCount = 0;
    for (const rawRow of rawRows) {
      if (rawRow.every((cell) => cell.trim() === "")) {
        blankCount++;
        continue;
      }
      const payload = buildPayload(rawRow);
      if (!payload) {
        invalidCount++;
        continue;
      }
      payloads.push(payload);
    }

    if (payloads.length === 0) {
      toast.error(t("noValidRows"));
      return;
    }

    setIsBusy(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/roster/import/preview`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ rows: payloads }),
        },
      );
      if (!response.ok) {
        await handleError(response);
        return;
      }
      const results = (await response.json()) as ImportRowPreview[];
      setPreviewRows(
        results.map((result) => ({
          payload: payloads[result.index],
          status: result.status,
          candidates: result.candidates,
          included: true,
          declined: false,
          ambiguousChoice: null,
        })),
      );
      if (blankCount > 0) toast(t("skippedBlankRows", { count: blankCount }));
      if (invalidCount > 0) toast(t("skippedInvalidRows", { count: invalidCount }));
      setStep("preview");
    } catch {
      toast.error(tErrors("AUTH.UNKNOWN"));
    } finally {
      setIsBusy(false);
    }
  };

  const updateRow = (index: number, patch: Partial<PreviewRowState>) => {
    setPreviewRows((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  interface ResolvedDecision {
    action: "CREATE" | "UPDATE" | "REACTIVATE";
    playerId?: number;
    playerTeamId?: number;
  }

  const resolveDecision = (row: PreviewRowState): ResolvedDecision | null => {
    if (!row.included) return null;
    switch (row.status) {
      case "NEW":
        return { action: "CREATE" };
      case "MODIFICATION": {
        const candidate = row.candidates[0];
        if (!candidate?.activeAssignmentInTeam) return null;
        return {
          action: "UPDATE",
          playerId: candidate.playerId,
          playerTeamId: candidate.activeAssignmentInTeam.id,
        };
      }
      case "REACTIVATION": {
        const candidate = row.candidates[0];
        if (!candidate) return null;
        return row.declined
          ? { action: "CREATE" }
          : { action: "REACTIVATE", playerId: candidate.playerId };
      }
      case "AMBIGUOUS": {
        if (row.ambiguousChoice === null) return null;
        return row.ambiguousChoice === IGNORE
          ? { action: "CREATE" }
          : { action: "REACTIVATE", playerId: row.ambiguousChoice };
      }
    }
  };

  const hasUnresolvedAmbiguous = previewRows.some(
    (row) => row.included && row.status === "AMBIGUOUS" && row.ambiguousChoice === null,
  );
  const includedCount = previewRows.filter((row) => row.included).length;
  const canCommit = includedCount > 0 && !hasUnresolvedAmbiguous;

  const handleCommit = async () => {
    const decisions = previewRows
      .map((row) => {
        const resolved = resolveDecision(row);
        return resolved ? { ...resolved, row: row.payload } : null;
      })
      .filter((decision): decision is NonNullable<typeof decision> => decision !== null);

    if (decisions.length === 0) return;

    setIsBusy(true);
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/teams/${teamId}/roster/import/commit`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: JSON.stringify({ decisions }),
        },
      );
      if (!response.ok) {
        await handleError(response);
        return;
      }
      const result = (await response.json()) as {
        created: number;
        updated: number;
        reactivated: number;
      };
      toast.success(t("commitSuccess", result));
      setOpen(false);
      resetAll();
      onSuccess();
    } catch {
      toast.error(tErrors("AUTH.UNKNOWN"));
    } finally {
      setIsBusy(false);
    }
  };

  const statusLabel = (status: PlayerMatchStatus) => {
    switch (status) {
      case "NEW":
        return t("statusNew");
      case "MODIFICATION":
        return t("statusModification");
      case "REACTIVATION":
        return t("statusReactivation");
      case "AMBIGUOUS":
        return t("statusAmbiguous");
    }
  };

  const statusVariant = (status: PlayerMatchStatus) => {
    switch (status) {
      case "NEW":
        return "secondary" as const;
      case "MODIFICATION":
        return "outline" as const;
      case "REACTIVATION":
        return "default" as const;
      case "AMBIGUOUS":
        return "destructive" as const;
    }
  };

  const candidateLabel = (candidate: PlayerMatchCandidate) => {
    let label = `${candidate.firstName} ${candidate.lastName}`;
    if (candidate.licenseNumber) {
      label += t("candidateLicenseSuffix", { license: candidate.licenseNumber });
    }
    if (candidate.activeTeamsElsewhere.length > 0) {
      label += t("candidateElsewhereSuffix", {
        teamName: candidate.activeTeamsElsewhere[0].teamName,
      });
    }
    return label;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-2rem)] overflow-auto sm:max-w-[calc(100vw-4rem)]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("uploadInstructions")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-file">{t("chooseFile")}</Label>
              <Input
                id="import-file"
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <DialogFooter>
              <Button disabled={!file || isBusy} onClick={handleAnalyzeFile}>
                {t("analyzeButton")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("mappingInstructions")}</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columnHeader")}</TableHead>
                    <TableHead>{t("sampleHeader")}</TableHead>
                    <TableHead>{t("fieldHeader")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, columnIndex) => (
                    <TableRow key={columnIndex}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {rawRows[0]?.[columnIndex] ?? ""}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[columnIndex]}
                          onValueChange={(value: ColumnMapping | null) =>
                            handleMappingChange(columnIndex, value ?? IGNORE)
                          }
                        >
                          <SelectTrigger className="w-48" aria-label={header}>
                            <SelectValue>
                              {(value: ColumnMapping | null) =>
                                value && value !== IGNORE
                                  ? t(`field.${value}`)
                                  : t("ignoreOption")
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORE}>{t("ignoreOption")}</SelectItem>
                            {TARGET_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>
                                {t(`field.${field}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!canContinueMapping && (
              <p className="text-sm text-destructive">{t("mappingMissingRequired")}</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                {t("backButton")}
              </Button>
              <Button
                disabled={!canContinueMapping || isBusy}
                onClick={handleContinueToPreview}
              >
                {t("continueButton")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("previewInstructions")}</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">{t("includeColumn")}</TableHead>
                    <TableHead>{t("nameColumn")}</TableHead>
                    <TableHead>{t("statusColumn")}</TableHead>
                    <TableHead>{t("decisionColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, index) => (
                    <TableRow key={index} className={!row.included ? "opacity-50" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={row.included}
                          onCheckedChange={(checked) =>
                            updateRow(index, { included: checked === true })
                          }
                          aria-label={`${t("includeColumn")} ${row.payload.firstName} ${row.payload.lastName}`}
                        />
                      </TableCell>
                      <TableCell>
                        {row.payload.firstName} {row.payload.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.status === "NEW" && (
                          <span className="text-sm text-muted-foreground">
                            {t("decisionCreateNotice")}
                          </span>
                        )}
                        {row.status === "MODIFICATION" && (
                          <span className="text-sm text-muted-foreground">
                            {t("decisionUpdateNotice")}
                          </span>
                        )}
                        {row.status === "REACTIVATION" && row.candidates[0] && (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">
                              {candidateLabel(row.candidates[0])}
                            </span>
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={!row.declined}
                                onCheckedChange={(checked) =>
                                  updateRow(index, { declined: checked !== true })
                                }
                              />
                              {t("decisionReactivateLabel")}
                            </label>
                            {row.declined && (
                              <span className="text-xs text-muted-foreground">
                                {t("decisionReactivateDeclined")}
                              </span>
                            )}
                          </div>
                        )}
                        {row.status === "AMBIGUOUS" && (
                          <div className="flex flex-col gap-1">
                            <Select
                              value={
                                row.ambiguousChoice === null
                                  ? undefined
                                  : String(row.ambiguousChoice)
                              }
                              onValueChange={(value: string | null) =>
                                updateRow(index, {
                                  ambiguousChoice:
                                    value === null
                                      ? null
                                      : value === IGNORE
                                        ? IGNORE
                                        : Number(value),
                                })
                              }
                            >
                              <SelectTrigger
                                className="w-64"
                                aria-label={t("decisionAmbiguousPlaceholder")}
                              >
                                <SelectValue
                                  placeholder={t("decisionAmbiguousPlaceholder")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {row.candidates.map((candidate) => (
                                  <SelectItem
                                    key={candidate.playerId}
                                    value={String(candidate.playerId)}
                                  >
                                    {candidateLabel(candidate)}
                                  </SelectItem>
                                ))}
                                <SelectItem value={IGNORE}>
                                  {t("decisionAmbiguousCreateNew")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {row.ambiguousChoice === null && (
                              <span className="text-xs text-destructive">
                                {t("decisionAmbiguousUnresolved")}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("mapping")}>
                {t("backButton")}
              </Button>
              <Button disabled={!canCommit || isBusy} onClick={handleCommit}>
                {t("commitButton")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
