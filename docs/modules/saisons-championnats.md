# Module — Saisons & Championnats

## Vision

Une `Season` est le cadre temporel **partagé par tout le club** sur une période définie
(révision A14, docs/roadmap.md — initialement scopée équipe, corrigé suite à un retour
utilisateur : toutes les équipes d'un club suivent le même calendrier de saisons, avoir une
`Season` distincte par équipe dupliquait une information censée être unique pour le club).
Chaque `Team` peut ensuite avoir un ou plusieurs `Championship` rattachés à cette `Season`
partagée. Exemple suisse :

- **Équipe adulte** : la Season "2024–2025" (juillet → juin, commune à tout le club) contient un
  Championship "Championnat 2024–2025" propre à cette équipe.
- **Équipe junior suisse** : sur cette même Season du club, l'équipe junior peut avoir deux
  Championships distincts — "Championnat d'Automne" et "Championnat du Printemps" — alors que
  l'équipe adulte n'en a qu'un sur la même période. C'est l'utilisateur (chaque Coach, pour son
  équipe) qui décide du découpage de ses propres championnats.

Le nombre de Championships par équipe par Season n'est pas limité — le modèle couvre tous les
cas selon les pays et fédérations. Les championnats sont créés par les Coachs eux-mêmes, à
tout moment de la saison, **indépendamment** de la création de la Season (pas de wizard reliant
les deux — voir §Workflow ci-dessous).

---

## Cycle de vie d'une Season

### États d'une Season

| État | Description |
|---|---|
| `DRAFT` | En préparation (ex. créée en avance par l'AdminClub). La saison courante du club reste `ACTIVE`. |
| `ACTIVE` | Saison courante du club. **Une seule par club** à tout instant. |
| `ARCHIVED` | Saison terminée. Données consultables et modifiables, mais plus active. |

### Créer et activer une saison (révision A14 — plus de wizard)

Gestion réservée à AdminClub/SuperAdmin/Proprietaire (Coach et Player n'ont que la lecture,
voir §Droits par rôle) — une décision qui engage tout le club, pas une seule équipe.

**Création** : modale simple (nom, `startDate`, `endDate`) — pattern identique à toute autre
création dans l'application (`PlayerFormDialog`, `NoteFormDialog`...), jamais une page ou un
wizard dédié. La Season est créée en `DRAFT` ; la saison courante du club reste `ACTIVE`, les
deux coexistent.

**Activation** : action ponctuelle (bouton **Activer** + confirmation) sur la fiche de la
saison DRAFT. L'utilisateur peut corriger la `endDate` de l'ancienne saison ACTIVE du club si
elle existe (pré-remplie, modifiable — ex. nouvelle saison créée en août alors que l'ancienne
se terminait officiellement en juin). À la confirmation :
1. L'ancienne saison ACTIVE du club (s'il y en a une) passe en `ARCHIVED`, avec sa `endDate`
   éventuellement corrigée.
2. La nouvelle saison passe en `ACTIVE`.

**Aucune transaction sur `PlayerTeam`** : contrairement à la conception d'origine (wizard avec
étape "importer le roster"), l'activation d'une saison ne touche plus aucune affectation
joueur↔équipe. `PlayerTeam` n'a jamais eu de FK directe vers `Season` (appartenance déduite des
dates `joinDate`/`leaveDate`) — un joueur qui ne change rien reste donc valide d'une saison à
l'autre sans aucune action requise. Voir §Mouvements de joueurs entre équipes ci-dessous pour
la gestion des vrais changements (départs, arrivées, promotions de catégorie).

### Mouvements de joueurs entre équipes (au fil de l'eau, pas de wizard de transition)

Les départs, arrivées et promotions de catégorie (ex. un joueur qui monte de U15 à U16 d'une
saison à l'autre) se gèrent directement via l'Effectif, à tout moment, indépendamment de
l'activation d'une saison :
- **Départ** : action "Archiver" déjà existante sur l'affectation `PlayerTeam` du joueur
  (pose `leaveDate`), depuis l'équipe qu'il quitte.
- **Arrivée d'un nouveau joueur** (jamais inscrit dans le club) : "Ajouter un joueur" →
  mode "Nouveau joueur" (crée `Member` + `PlayerProfile` + `PlayerTeam`).
- **Promotion / transfert d'un joueur déjà présent dans le club** (ex. U15 → U16) : "Ajouter un
  joueur" → mode "Joueur existant du club" (par défaut, recherche club-wide) — retrouve le
  joueur par nom, affiche son équipe actuelle, et crée uniquement une nouvelle affectation
  `PlayerTeam` sur la nouvelle équipe, sans recréer son profil. **L'ancienne affectation n'est
  jamais fermée automatiquement** : c'est un geste séparé (Archiver, ci-dessus), laissé au Coach
  de l'ancienne équipe — évite un problème de permission (le Coach de la nouvelle équipe n'a
  aucun droit d'écriture sur l'ancienne équipe) et garde chaque Coach maître de sa propre
  équipe. Voir `docs/modules/effectif-joueurs.md`.

---

### Modification des saisons archivées

Les données des saisons passées sont **toujours consultables et modifiables**. Il n'y a pas de
verrou sur une saison archivée. Cas d'usage typique : corriger une information manquante sur
la saison qui vient de se terminer après avoir déjà créé la nouvelle.

**Conséquence à documenter pour les utilisateurs** : modifier une date ou un `PlayerTeam`
sur une saison archivée impacte les statistiques calculées pour cette période — c'est le
comportement attendu, pas un bug.

---

## Historique des assignations joueur ↔ équipe

### Comment ça fonctionne

Chaque mouvement de joueur (archivage d'une affectation, ajout à une nouvelle équipe — voir
§Mouvements de joueurs entre équipes ci-dessus) pose des dates explicites sur `PlayerTeam`.
L'historique d'un joueur est donc lisible par simple tri chronologique :

```
Joueur X — historique PlayerTeam :
  U13 A : joinDate 01/09/2022, leaveDate 30/06/2023  ← Saison 2022/2023
  U14 A : joinDate 01/09/2023, leaveDate 30/06/2024  ← Saison 2023/2024
  U15 A : joinDate 01/09/2024, leaveDate null         ← Saison actuelle
```

### Consultation du profil joueur par saison

Sur la fiche du joueur, un **sélecteur "Saison"** (`SeasonFilterSelect`, A12) au-dessus des
onglets permet de filtrer les 4 onglets Entretien/Notes/Objectifs/Évaluation par saison précise.
Modes implémentés :

| Mode | Requête sous-jacente |
|---|---|
| Saison précise (défaut = saison ACTIVE du club) | `WHERE <date entité> BETWEEN season.startDate AND season.endDate` |
| Tranche de dates libre ("Période personnalisée") | `WHERE <date entité> BETWEEN dateA AND dateB` |
| Tout (depuis entrée au club) | pas de filtre de date |

Deux modes envisagés en conception restent **non implémentés**, voir `docs/schema/joueurs.md`
§Filtrage des statistiques par période et `docs/roadmap.md` Partie A §Points reportés :
- **Championnat précis** — non applicable, ces 4 entités n'ont aucune FK vers `ChampionshipMatch`.
- **Catégorie** (`season.categorySnapshot`) — différé, aucune UI ne permet de renseigner ce champ
  sur une `Season` à ce jour.

Les `PlayerMeasurement` (taille, poids) s'affichent **toujours** en graphique d'évolution
temporelle complète, indépendamment du filtre de saison — l'évolution physique se lit dans
la durée, pas par saison.

---

## Championship

Chaque championnat définit :
- Ses propres dates (définies librement, indépendantes de la Season).
- Système de points : `pointsForWin`, `pointsForDraw`, `pointsForLoss`.
- Règles de départage : tableau JSON ordonné de `TiebreakerRule`.
- Format de jeu par défaut : `numberOfPeriods` + `periodDurationMinutes` (écrasables par match).

### Presets de règles de départage

| Preset | Règles dans l'ordre |
|---|---|
| Standard UEFA | GOAL_DIFFERENCE → GOALS_SCORED → HEAD_TO_HEAD_POINTS → HEAD_TO_HEAD_GOAL_DIFF |
| Ligue suisse junior | GOAL_DIFFERENCE → GOALS_SCORED → WINS |
| Simple | GOAL_DIFFERENCE → GOALS_SCORED |
| Personnalisé | Configuration libre depuis la liste des règles disponibles |

### Règles de départage disponibles

```
GOAL_DIFFERENCE           différence de buts générale
GOALS_SCORED              buts marqués (général)
GOALS_CONCEDED            buts encaissés (ordre croissant)
WINS                      nombre de victoires
HEAD_TO_HEAD_POINTS       points en confrontation directe
HEAD_TO_HEAD_GOAL_DIFF    différence de buts en confrontation directe
HEAD_TO_HEAD_GOALS_SCORED buts marqués en confrontation directe
AWAY_GOALS                règle du but à l'extérieur
RANDOM                    tirage au sort (dernier recours, signalé dans l'UI)
```

**FAIR_PLAY exclu du MVP** : système de points de pénalité géré par la fédération, non
calculable automatiquement. Post-MVP : saisie manuelle de points de pénalité sur la fiche
équipe du championnat.

---

## ChampionshipParticipant

Représente une équipe dans un championnat :
- Équipe interne : `internalTeamId → Team`
- Équipe externe : `externalTeamId → ExternalTeam`

Contrainte applicative : exactement l'un des deux doit être non-null.

**Limite MVP (B8, docs/roadmap.md)** : `internalTeamId` est restreint à l'équipe propriétaire
du championnat (`Championship.teamId`) — un championnat créé par l'équipe U15 ne peut donc
jamais compter une AUTRE équipe interne du club (ex. U15 B) comme participante, seulement des
`ExternalTeam`. Deux équipes du même club affrontées dans le même championnat = hors scope MVP
(évite d'avoir à gérer un "affrontement intra-club" dans l'algorithme de classement, B12).

---

## ExternalTeam

Scopée au **Club** (pas au championship ni à la season). Créée une fois, réutilisable d'un
championnat à l'autre. Sert aussi de contexte pour les rapports de scouting.

---

## ChampionshipMatch

Représente toute rencontre du championnat — notre équipe ou adversaires entre eux.

**Règle de score — source de vérité unique** :

| Type de match | Où est stocké le score |
|---|---|
| Match amical (pas de championnat) | `Match.scoreHome` / `Match.scoreAway` |
| Match de championnat | `ChampionshipMatch.scoreHome/Away`. `Match.scoreHome/Away` = NULL |

**Format de jeu** : `numberOfPeriods` et `periodDurationMinutes` héritent du Championship,
écrasables par match individuel.

---

## Classement — calculé à la volée

Calculé à chaque requête depuis les `ChampionshipMatch` terminés. Pas de table `Standing` en
MVP (20 équipes × ~20 matchs = quelques centaines de lignes, parfaitement supportable).

**Algorithme** :
1. Agréger points, buts, victoires/nuls/défaites par `ChampionshipParticipant`.
2. Trier par points décroissants.
3. Appliquer `tiebreakerRules` dans l'ordre en cas d'égalité.
4. `HEAD_TO_HEAD_*` : sous-agréger sur les matchs entre les équipes ex-aequo uniquement.

---

## Droits par rôle

`Season` est club-wide depuis la révision A14 : sa gestion (création/édition/activation) est
réservée à AdminClub/SuperAdmin/Proprietaire — un Coach n'a plus qu'un droit de lecture, transmis
via `?teamId=` (la route `clubs/:clubId/seasons` ne porte pas de `:teamId`, voir
`docs/modules/auth-roles.md` §"Patterns découverts", même pattern que `evaluation_config`).
`Championship` reste, lui, scopé équipe (voir note dans la section Championship ci-dessus) —
c'est pourquoi sa gestion reste ouverte au Coach.

| Action | Coach (son équipe) | AdminClub | SuperAdmin / Propriétaire | Player | Parent |
|---|---|---|---|---|---|
| Consulter les saisons du club (peuple le sélecteur, A12) | ✅ (lecture, via `?teamId=`) | ✅ | ✅ | ✅ (lecture, via `?teamId=`) | ❌ |
| Créer / activer une Season | ❌ | ✅ | ✅ | ❌ | ❌ |
| Modifier une Season (y compris archivée) | ❌ | ✅ | ✅ | ❌ | ❌ |
| Créer un Championship (pour sa propre équipe) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ajouter des ExternalTeam | ✅ | ✅ | ✅ | ❌ | ❌ |
| Saisir les résultats adverses | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir le classement | ✅ | ✅ | ✅ | ✅ (lecture) | ❌ |

**Parent** n'a, dans le seed actuel (`backend/prisma/seed.ts`), aucune permission sur
`championship`/`championship_participant`/`championship_match`/`external_team` — seulement
`member READ OWN`. Un écart avec la conception initiale de la Partie B (qui envisageait un
`READ TEAM` pour Parent au même titre que Player, "nécessaire pour le classement") : non câblé
en pratique, cohérent avec le constat déjà documenté ailleurs que le rôle Parent n'est
globalement pas branché à un `MemberRole` fonctionnel dans le MVP (voir
`docs/decisions-ouvertes-et-rgpd.md`). À revoir si Parent devient un rôle réellement utilisé.
