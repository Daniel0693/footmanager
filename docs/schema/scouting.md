# Schéma — Scouting (Observation et Recrutement)

> Deux types de rapports distincts qui peuvent vivre ensemble ou séparément.
> Scopés au Club — visibles par tout le staff technique, pas par les Players/Parents.
> Voir `docs/modules/scouting.md` pour la logique fonctionnelle complète.

---

## PlayingStyleTag — Tags de style de jeu (TeamScoutingReport)

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | ex. "pressing-haut", "bloc-bas" |
| `isSystem` | Boolean | `true` = tag prédéfini, non supprimable |
| `clubId` | FK → Club, nullable | `null` = tag système ; non-null = tag libre du club |

**Tags système pré-chargés (seed)** :
`pressing-haut`, `contre-attaque`, `possession`, `jeu-long`, `bloc-bas`, `repli-rapide`,
`jeu-direct`, `jeu-en-triangle`, `largeur-du-jeu`, `jeu-combinatoire`,
`transitions-rapides`, `physique-dominant`

**Tags libres** : créés par un utilisateur du club, stockés et réutilisables pour tous les
rapports de ce club.

---

## TeamScoutingReport — Rapport d'analyse d'équipe adverse

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `authorId` | FK → Member | |
| `clubId` | FK → Club | scope de visibilité |
| `championshipMatchId` | FK → ChampionshipMatch, nullable | si match de championnat suivi |
| `observedHomeTeamId` | FK → ExternalTeam, nullable | si hors championnat |
| `observedAwayTeamId` | FK → ExternalTeam, nullable | si hors championnat |
| `targetExternalTeamId` | FK → ExternalTeam | équipe analysée |
| `observedAt` | DateTime | date de la rencontre observée |
| `formation` | String, nullable | ex. "4-3-3" |
| `offensiveOrganization` | Text, nullable | |
| `defensiveOrganization` | Text, nullable | |
| `transitionAttack` | Text, nullable | |
| `transitionDefense` | Text, nullable | |
| `setPiecesAttack` | Text, nullable | |
| `setPiecesDefense` | Text, nullable | |
| `strengths` | Text, nullable | |
| `weaknesses` | Text, nullable | |
| `recommendation` | Text, nullable | recommandations tactiques |
| `generalNotes` | Text, nullable | |
| `overallRating` | Decimal(4,1), nullable | **sur 10** |

---

## TeamScoutingReportTag — Junction TeamScoutingReport ↔ PlayingStyleTag

| Champ | Type | Notes |
|---|---|---|
| `teamScoutingReportId` | FK → TeamScoutingReport | |
| `playingStyleTagId` | FK → PlayingStyleTag | |

**Clé primaire composite** : `(teamScoutingReportId, playingStyleTagId)`.

---

## PlayerScoutingCriterion — Critère d'évaluation pour observer un joueur externe

Table **distincte** de `EvaluationCriterion` (joueurs internes). Les dimensions et critères
reflètent une observation en match, pas un suivi à l'entraînement.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | ex. "Vitesse de déplacement" |
| `dimension` | enum `ScoutingDimension` | |
| `isSystem` | Boolean | `true` = critère prédéfini, non supprimable |
| `clubId` | FK → Club, nullable | `null` = critère système ; non-null = critère custom du club |
| `description` | String, nullable | |

**Critères système pré-chargés (seed)** :

| Dimension | Critères |
|---|---|
| PHYSIQUE | Gabarit / morphologie · Vitesse de déplacement · Endurance / condition physique · Puissance / force |
| TECHNIQUE | Contrôle de balle · Passe courte · Passe longue / centre · Frappe de balle · Dribble / 1c1 · Jeu de tête · Pied faible |
| TACTIQUE | Placement sans ballon · Lecture du jeu · Prise de décision · Pressing et récupération · Utilisation de l'espace |
| MENTAL | Concentration et régularité · Leadership · Attitude et comportement · Combativité · Résilience |

---

## PlayerScoutingReport — Rapport d'observation d'un joueur

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `authorId` | FK → Member | |
| `clubId` | FK → Club | scope de visibilité |
| `externalPlayerId` | FK → ExternalPlayer, nullable | null si joueur inconnu au moment de la rédaction |
| `teamScoutingReportId` | FK → TeamScoutingReport, nullable | rapport d'équipe associé |
| `championshipMatchId` | FK → ChampionshipMatch, nullable | |
| `observedAt` | DateTime | |
| `positionObserved` | enum `Position`, nullable | poste joué dans ce match — voir `index.md` |
| `freeContext` | String, nullable | contexte si hors championnat et hors rapport d'équipe |
| `strengths` | Text, nullable | |
| `weaknesses` | Text, nullable | |
| `overallRating` | Decimal(4,1), nullable | **sur 10** — calculé depuis les dimensions, modifiable |
| `generalNotes` | Text, nullable | |
| `recommendation` | enum `ScoutingRecommendation`, nullable | |
| `urgency` | enum `ScoutingUrgency`, nullable | |
| `recruitmentNotes` | Text, nullable | notes confidentielles de recrutement |

**Note globale** : calculée comme la moyenne des 4 moyennes de dimension
(`AVG(score par dimension)`), modifiable manuellement si l'observateur veut ajuster.

---

## PlayerScoutingEvaluation — Note sur un critère de scouting

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerScoutingReportId` | FK → PlayerScoutingReport | |
| `criterionId` | FK → PlayerScoutingCriterion | |
| `score` | Decimal(4,1) | **sur 10**, paliers de 0.5 |
| `comment` | String, nullable | observation courte sur ce critère |

Note de synthèse par dimension = `AVG(score)` des critères de cette dimension pour ce rapport.

---

## Enums

```prisma
enum ScoutingDimension {
  PHYSIQUE
  TECHNIQUE
  TACTIQUE
  MENTAL
}

enum ScoutingRecommendation {
  NON_PERTINENT
  A_SUIVRE
  A_APPROCHER
  A_RECRUTER
}

enum ScoutingUrgency {
  AUCUNE
  FAIBLE
  MOYENNE
  HAUTE
}
```

---

## Index

```
@@index([clubId])                                          sur TeamScoutingReport, PlayerScoutingReport
@@index([targetExternalTeamId])                            sur TeamScoutingReport
@@index([externalPlayerId])                                sur PlayerScoutingReport
@@unique([playerScoutingReportId, criterionId])            sur PlayerScoutingEvaluation
@@index([teamScoutingReportId])                            sur PlayerScoutingReport
```
