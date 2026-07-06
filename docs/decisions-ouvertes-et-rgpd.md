# Décisions ouvertes & contraintes RGPD

> Mettre à jour ce fichier dès qu'une décision est tranchée : déplacer l'item dans la section
> "Décisions tranchées" avec la date et la justification, et l'intégrer dans le fichier `docs/`
> concerné.

---

## Décisions tranchées (intégrées dans la documentation)

| Décision | Résultat |
|---|---|
| Table `TeamStaff` | Confirmée. Rôles : `PRINCIPAL`, `CO_ENTRAINEUR`, `ADJOINT`. |
| Harmonisation de la notation | Sur 10, `Decimal(4,1)`, paliers de 0.5, affichage 5 étoiles. |
| Visibilité AdminClub sur le contenu de séance | Lecture complète (exercices, stats, présences). |
| Fenêtre d'édition `TrainingFeedback` | Définie par l'entraîneur (`editableUntil`). Après = verrouillé sauf entraîneur. |
| Rôle `Proprietaire` | Implémenté dès le MVP. Mécanisme de transfert sécurisé à concevoir. |
| Structure Season / Championship | Season (cadre temporel) → Championship (1..N). Dates définies librement. |
| ExternalTeam scopée au Club | Pas au championship. Créée une fois, réutilisable d'une saison à l'autre. |
| Score — source de vérité | Sur `ChampionshipMatch` pour les matchs de championnat. Sur `Match` pour les matchs amicaux. |
| Classement | Calculé à la volée depuis `ChampionshipMatch`. Pas de table `Standing` en MVP. |
| Règles de départage | Enum + tableau JSON ordonné + presets. FAIR_PLAY exclu du MVP. |
| Live match — périodes | `MatchPeriod` (startedAt/endedAt côté serveur), nombre de périodes configurable par championship + override par match. |
| Live match — multi-utilisateur | Mono-utilisateur pour le MVP. Multi-utilisateur en temps réel : phase ultérieure. |
| Assist | `relatedPlayerId` sur l'événement GOAL (pas un événement séparé). |
| Scouting hors championnat | `championshipMatchId` nullable, deux `ExternalTeam` comme contexte du match observé. |
| ExternalPlayer | Table dédiée, liée à `ExternalTeam`, réutilisable entre rapports (historisation). |
| Tags de style de jeu | Liste prédéfinie système + tags libres créés et stockés par club. |
| Visibilité des rapports de scouting | Scopés au Club. Staff technique uniquement. Players et Parents exclus. |
| Historisation des saisons | `Season.teamNameSnapshot` + `Season.categorySnapshot`. `Team` reste l'ancre stable. Roster et staff historisés via `joinDate`/`leaveDate` sur `PlayerTeam`/`TeamStaff`. |
| 6 catégories du radar d'évaluation | Technique · Tactique · Physique · Mental · Émotionnel · Vie de groupe. Système rendu dynamique via `EvaluationCategory` + `ClubEvaluationConfig`. Configurable par club. Extensible par sport. |
| Modèle de visibilité Privé/Semi-privé/Public | Privé = staff seulement. Semi-privé = joueur + staff. Public = parents + joueur + staff. Coaches d'autres équipes du même club exclus (même en PUBLIC). Voir `effectif-joueurs.md`. |
| Club.sport | Ajouté sur `Club` dès le MVP (`SportType` enum, défaut FOOTBALL). |
| EvaluationCategory comme entité propre | `category` (String) remplacé par `categoryId` (FK → EvaluationCategory). |
| Workflow de transition de saison | Wizard 4 étapes : Draft → import roster → config → activation. Saison archivée modifiable. |
| Season.status | DRAFT / ACTIVE / ARCHIVED. Une seule ACTIVE par Team. |
| ExternalPlayer.externalTeamId nullable | Validé. Assignable plus tard — tous les rapports existants en bénéficient. |
| Rôle Recruteur | Preset de rôle dynamique (pas un rôle système). Configurable par AdminClub. |
| TeamScoutingReport vs PlayerScoutingReport | Deux entités distinctes. Peuvent vivre ensemble ou séparément. |
| PlayerScoutingCriterion | Table distincte de EvaluationCriterion. ~20 critères système par 4 dimensions + critères custom par club. |
| Note globale PlayerScoutingReport | Calculée depuis AVG des 4 dimensions, modifiable manuellement. |
| Postes (`Position`) | Liste granulaire de 15 postes réels (codes anglais, ex. `CDM`, `RWB`) plutôt que 4 lignes génériques. La ligne (GK/DEF/MID/ATT) n'est pas stockée : dérivée en code à partir du poste précis. Voir `docs/schema/index.md`. |
| Unicité numéro de maillot (`PlayerTeam.jerseyNumber`) | Pas de contrainte SQL `@@unique([teamId, jerseyNumber])` — incompatible avec l'historisation (`joinDate`/`leaveDate`). Vérifiée au niveau applicatif, parmi les affectations **actives** uniquement. |
| Accès `TEAM`-scopé sur une route de liste sans `:teamId` | Pattern self-service (`GET .../me`, `GET .../mine`) : contourne `PermissionsGuard`, résolution directe dans le service. Voir `docs/modules/auth-roles.md` §Patterns découverts. |
| Protection de la fiche `TeamStaff` du Principal | Appliquée explicitement dans `TeamStaffService`, pas dans le moteur RBAC générique (règle non exprimable en `resource`/`action`/`scope`). |
| "Mes clubs" (`GET /clubs`) | Scope : clubs où l'utilisateur a une fiche `Member`. Remplace un suivi `localStorage` non fiable (id de club persistant entre comptes dans le même navigateur). Un compte ne peut pour l'instant créer qu'un seul club (aucun flux "rejoindre un club" existant) — à revisiter si le multi-club post-MVP est implémenté. |
| Visibilité par champ sur `PlayerInterview` | `staffAssessment` (ressenti/évaluation interne de l'encadrant) n'est **jamais** transmis à un appelant en scope `OWN` (Player) — même tension RGPD Article 15 que les notes `PRIVE`. Un Player ne voit en plus que les entretiens déjà passés, jamais ceux à venir. `staffFeedback`/`staffAssessment`/`playerFeedback` sont tous optionnels : un entretien peut être planifié à l'avance (date/sujet/résumé seuls) puis complété après coup. Voir `docs/modules/effectif-joueurs.md` §Entretien. |

---

## Décisions ouvertes — avant implémentation

### 1. Mécanisme de transfert sécurisé du rôle Propriétaire

Le `Proprietaire` est implémenté dès le MVP, mais le mécanisme de transfert/succession
(validation par email, délai de confirmation, log d'audit irréversible, ou autre) doit être
conçu et documenté avant l'implémentation de cette fonctionnalité spécifique.

### 2. Gestion des notifications et convocations

Le système de notification (email, push, in-app) pour les convocations, rappels d'événements
et feedbacks n'est pas encore spécifié. Les convocations elles-mêmes dépendent de
`MatchAttendance` (Phase 4) et `TrainingAttendance` (Phase 5) — pas d'un `Event` générique
(Phase 2). À documenter dans `docs/modules/notifications.md` avant la Phase 4.

### 3. FAIR_PLAY post-MVP

Le système suisse de points de pénalité (géré par la fédération, variable selon la gravité,
non calculable automatiquement) sera, si implémenté, une **saisie manuelle** de points de
pénalité par l'utilisateur sur la fiche équipe du championnat — pas un calcul automatique
depuis les cartons. À concevoir et documenter en phase post-MVP.

### 4. Modules futurs à documenter avant implémentation

- **Cotisations / finances** (trésorerie du club)
- **Covoiturage** (organisation parents)
- **Messagerie interne**
- **Fil d'actualité / partage de moments d'équipe**
- **Notifications** (email, push, in-app)

### 5. Liaison Parent ↔ Joueur (Member enfant)

Aucune table de liaison entre un `Member` avec le rôle `Parent` et le(s) `Member`(s) enfant(s)
n'existe dans le schéma actuel (`fondations.md`, `joueurs.md`). `PermissionScope` (`OWN` /
`TEAM` / `CLUB` / `ALL`) ne permet pas nativement de scoper un accès "à mon enfant précis"
sans sur-exposer le reste de l'équipe. À concevoir (ex. table `ParentChild` ou équivalent)
avant de câbler le rôle `Parent` sur le module Effectif ou Calendrier — non traité en Phase 2.

## Contraintes RGPD

### Tension Article 15 (droit d'accès) vs notes privées

Les notes `PRIVE` ne sont pas visibles par le joueur dans l'UI normale — tension légale à
résoudre avant la mise en production (ex. procédure d'export manuel encadré). Même tension pour
`PlayerInterview.staffAssessment` (étape A7.2) : le ressenti/évaluation interne de l'encadrant sur
un entretien n'est jamais transmis au joueur concerné.

### Export formel des données (DSAR)

Prévoir un mécanisme d'export structuré de toutes les données d'un joueur sur demande.

### Consentement parental pour les mineurs

Prérequis légal avant la mise en production (RGPD Article 8). À concevoir dans le flux
d'inscription d'un joueur.

### Piste d'audit (audit trail)

`createdAt`/`updatedAt` partout — minimum. Audit trail plus complet pour les données sensibles
(notes privées, dossier médical) avant la mise en production réelle.

### Droit à l'effacement

Anonymisation préférable à la suppression physique quand des données sont liées à des
statistiques d'équipe (préserver l'intégrité référentielle).

### Données médicales (RGPD Article 9)

Les données de blessures et rééducation sont des données de santé — traitement soumis à des
exigences renforcées. L'accès doit être strictement limité via le système de permissions
granulaires (rôle `Physiotherapeute` ou équivalent).

### Données des rapports de scouting

Les `ExternalPlayer` sont des données personnelles de joueurs tiers (non-utilisateurs de
FootManager). Leur collecte doit être limitée aux informations strictement nécessaires à
l'usage sportif (nom, poste, numéro) — pas de données personnelles sensibles.
