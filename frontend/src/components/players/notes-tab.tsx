"use client";

import { Lock, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth/auth-context";
import type { NoteVisibility } from "@/lib/note-visibility";
import { NoteFormDialog } from "@/components/players/note-form-dialog";

interface Note {
  id: number;
  visibility: NoteVisibility;
  title: string | null;
  content: string;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
}

type SortOrder = "asc" | "desc";

const VISIBILITY_BADGE_VARIANT: Record<NoteVisibility, "outline" | "secondary" | "default"> = {
  PRIVE: "outline",
  SEMI_PRIVE: "secondary",
  PUBLIC: "default",
};

function toQueryString(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val) search.set(key, val);
  }
  return search.toString();
}

export function NotesTab({
  clubId,
  teamId,
  playerId,
  isOwnProfile,
}: {
  clubId: string;
  teamId: string;
  playerId: string;
  // Un joueur consultant sa propre fiche n'a que READ/OWN sur les notes
  // (voir backend/prisma/seed.ts, rôle Player) — jamais CREATE/UPDATE/
  // DELETE : masque l'ajout et les actions par ligne plutôt que de les
  // laisser mener à un 403 au clic.
  isOwnProfile: boolean;
}) {
  const t = useTranslations("notes");
  const locale = useLocale();
  const { accessToken } = useAuth();

  // Filtre/tri toujours résolus côté backend (décision du 2026-07-06,
  // réappliquée depuis les onglets Mesures/Entretien — docs/modules/effectif-joueurs.md).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [hasError, setHasError] = useState(false);

  const fetchNotes = useCallback(async () => {
    const query = toQueryString({
      teamId,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortOrder,
    });
    const response = await apiFetch(
      `/clubs/${clubId}/players/${playerId}/notes?${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new Error();
    return response.json();
  }, [clubId, playerId, teamId, dateFrom, dateTo, sortOrder, accessToken]);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotes();
      setNotes(data);
      setHasError(false);
    } catch {
      setHasError(true);
      toast.error(t("loadFailed"));
    }
  }, [fetchNotes, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchNotes();
        if (!cancelled) {
          setNotes(data);
          setHasError(false);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
          toast.error(t("loadFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchNotes, t]);

  const handleDelete = async (id: number) => {
    try {
      const response = await apiFetch(
        `/clubs/${clubId}/players/${playerId}/notes/${id}?teamId=${teamId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error();
      await load();
    } catch {
      toast.error(t("deleteFailed"));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Filtres (backend) + ajout */}
      <Card className="shrink-0">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {/* Plage de dates groupée en un seul bloc : les deux champs
                wrappent ensemble plutôt que de se retrouver séparés sur deux
                lignes (retour du 2026-07-06). */}
            <div className="flex flex-col gap-1.5">
              <Label>{t("dateRangeLabel")}</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label={t("dateFrom")}
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="w-36"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="date"
                  aria-label={t("dateTo")}
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="w-36"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sortOrder")}</Label>
              <Select
                value={sortOrder}
                onValueChange={(v) => setSortOrder((v as SortOrder) ?? "desc")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(v: string | null) => (v === "asc" ? t("sortAsc") : t("sortDesc"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">{t("sortDesc")}</SelectItem>
                  <SelectItem value="asc">{t("sortAsc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {!isOwnProfile && (
            <div className="flex justify-end">
              <NoteFormDialog
                clubId={clubId}
                teamId={teamId}
                playerId={playerId}
                onSuccess={load}
                trigger={
                  <Button>
                    <Plus />
                    {t("add")}
                  </Button>
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline : seule cette zone défile (flex-1 min-h-0 overflow-y-auto),
          la carte de filtres au-dessus reste fixe à l'écran. */}
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {hasError ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : notes === null ? null : notes.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          <ol className="flex flex-col gap-5 border-l-2 border-border pl-6">
            {notes.map((note) => (
              <li key={note.id} className="relative">
                <span className="absolute top-1.5 -left-[29px] size-3 rounded-full border-2 border-background bg-primary" />
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={VISIBILITY_BADGE_VARIANT[note.visibility]}>
                            {note.visibility === "PRIVE" && <Lock />}
                            {t(`visibility${note.visibility}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(note.createdAt)}
                          </span>
                        </div>
                        {note.title && (
                          <h3 className="text-sm font-semibold">{note.title}</h3>
                        )}
                      </div>
                      {!isOwnProfile && (
                        <div className="flex gap-1">
                          <NoteFormDialog
                            clubId={clubId}
                            teamId={teamId}
                            playerId={playerId}
                            note={note}
                            onSuccess={load}
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={t("edit")}>
                                <Pencil />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("delete")}
                            onClick={() => handleDelete(note.id)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>

                    {note.author && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserRound className="size-3.5" />
                        {t("authorLabel")} {note.author.firstName} {note.author.lastName}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
