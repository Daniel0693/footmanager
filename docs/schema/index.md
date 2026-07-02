# Schéma de base de données — Index & Conventions

> **Source de vérité du modèle de données FootManager.**
> Ce fichier est le point d'entrée. Il contient les conventions globales et les enums
> partagés entre plusieurs modules. Le détail de chaque domaine est dans son propre fichier.
>
> Règle de cohérence : toute modification du schéma Prisma doit être reportée dans le
> fichier `docs/schema/` concerné **dans le même commit**. En cas de divergence entre le
> code et la documentation, le signaler explicitement.

---

## Fichiers du schéma

| Fichier | Domaine | Entités principales |
|---|---|---|
| `fondations.md` | Auth, clubs, membres, rôles | User, Club, Team, Member, MemberRole, Role, Permission |
| `joueurs.md` | Profils joueurs, suivi individuel | PlayerProfile, PlayerTeam, TeamStaff, EvaluationCriterion, PlayerEvaluation, PlayerNote, PlayerObjective, PlayerInterview, PlayerAbsence |
| `evenements.md` | Calendrier, entraînement, matchs | Event, TrainingSession, Match, MatchPeriod, MatchEvent, MatchLineup |
| `championnats.md` | Saisons, compétitions, équipes externes | Season, Championship, ChampionshipMatch, ExternalTeam, ExternalPlayer |
| `scouting.md` | Observation et recrutement | TeamScoutingReport, PlayerScoutingReport, PlayerScoutingCriterion |
| `medical.md` | Blessures et rééducation | Injury, InjuryAssignment, InjuryRehabEvent |

---

## Conventions globales

### Clés primaires
```
id  Int  @id  @default(autoincrement())
```
Sauf exception documentée explicitement dans le fichier concerné.

### Timestamps — présents sur toutes les tables
```
createdAt  DateTime  @default(now())
updatedAt  DateTime  @updatedAt
```
Omis dans les tableaux de colonnes pour la lisibilité, mais **toujours présents**.

### Convention de notation — unique dans toute l'application
**Toutes les notes sont stockées en `Decimal(4,1)`, de 0.0 à 10.0, par paliers de 0.5.**
L'UI affiche ces valeurs sous forme d'**étoiles sur 5** (valeur / 2, demi-étoiles incluses).
Jamais d'autre échelle.

Colonnes concernées :
- `PlayerEvaluation.score`
- `TrainingSession.globalRating` + `TrainingFeedback.rating`
- `Match.globalRating` + `MatchPlayerRating.score`
- `TeamScoutingReport.overallRating`
- `PlayerScoutingReport.overallRating` + `PlayerScoutingEvaluation.score`

### Zéro duplicata
Chaque donnée a une seule source de vérité. Les valeurs calculables sont dérivées à la volée.
Si une valeur est matérialisée pour la performance, le documenter explicitement dans le fichier
concerné avec la justification.

### Normalisation
Normes relationnelles 3NF minimum. Pas de colonnes nullables en pagaille pour gérer des
sous-types — utiliser des tables dédiées ou des champs `type` avec des contraintes applicatives.

### i18n
Les données métier (noms, descriptions) sont stockées telles quelles. Les libellés système
(enums, statuts, types) sont traduits côté front via les clés i18n. Le back ne retourne
jamais de texte traduit — uniquement des codes/enums.

---

## Enums globaux (utilisés dans plusieurs modules)

```prisma
// Visibilité des notes, objectifs
enum NoteVisibility {
  PRIVE
  SEMI_PRIVE
  PUBLIC
}

// Postes sur le terrain — utilisé dans PlayerTeam, MatchLineup, PlayerScoutingReport
enum Position {
  GK   // Gardien
  DEF  // Défenseur
  MID  // Milieu
  ATT  // Attaquant
  // À affiner si des postes plus granulaires sont nécessaires
}

// Présence à un événement (entraînement ou match)
enum AttendanceStatus {
  PRESENT
  ABSENT_EXCUSE
  ABSENT_NON_EXCUSE
}

// Réponse à une convocation
enum ConvocationStatus {
  PENDING
  ACCEPTED
  DECLINED
}

// Côté du terrain (pour les événements de match)
enum TeamSide {
  HOME
  AWAY
}
```

---

## Table de correspondance — entité → fichier

| Entité | Fichier |
|---|---|
| User, RefreshToken | `fondations.md` |
| Club | `fondations.md` |
| Team | `fondations.md` |
| Member, MemberRole | `fondations.md` |
| Role, Permission, RolePermission | `fondations.md` |
| PlayerProfile | `joueurs.md` |
| PlayerMeasurement | `joueurs.md` |
| PlayerTeam | `joueurs.md` |
| TeamStaff | `joueurs.md` |
| EvaluationCategory, ClubEvaluationConfig | `joueurs.md` |
| EvaluationCriterion, PlayerEvaluation | `joueurs.md` |
| PlayerNote | `joueurs.md` |
| PlayerInterview | `joueurs.md` |
| PlayerObjective | `joueurs.md` |
| PlayerAbsence | `joueurs.md` |
| Event | `evenements.md` |
| TrainingSession, Exercise | `evenements.md` |
| TrainingSessionExercise | `evenements.md` |
| TrainingAttendance, TrainingFeedback | `evenements.md` |
| Match, MatchPeriod | `evenements.md` |
| MatchLineup, MatchEvent | `evenements.md` |
| MatchAttendance, MatchPlayerRating | `evenements.md` |
| Season | `championnats.md` |
| Championship | `championnats.md` |
| ChampionshipParticipant, ChampionshipMatch | `championnats.md` |
| ExternalTeam, ExternalPlayer | `championnats.md` |
| TeamScoutingReport, PlayingStyleTag | `scouting.md` |
| PlayerScoutingReport | `scouting.md` |
| PlayerScoutingCriterion, PlayerScoutingEvaluation | `scouting.md` |
| Injury, InjuryAssignment, InjuryRehabEvent | `medical.md` |

---

## Index global recommandé

Chaque fichier de schéma liste ses propres index. Règles générales :
- Toute FK fréquemment filtrée reçoit un index.
- Les colonnes de dates de filtrage temporel (`startAt`, `date`, `joinDate`) reçoivent un index.
- Les contraintes d'unicité métier sont documentées dans chaque fichier.
