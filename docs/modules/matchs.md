# Module — Matchs

## Principe de conception

`Match` est une extension **1–1** de l'entité générique `Event` du calendrier (un événement
de type `MATCH` possède une fiche `Match` associée). Ce choix réutilise toute la mécanique du
calendrier (création, filtres, code couleur, convocations).

Un `Match` peut être lié à un `ChampionshipMatch` (si c'est un match de championnat) via
`Match.championshipMatchId`. Voir `docs/modules/saisons-championnats.md` pour la règle de
source de vérité sur le score.

Entités associées (détail des champs : `docs/schema/evenements.md`) :
- `Match` — fiche du match de notre équipe
- `MatchPeriod` — gestion des périodes (live)
- `MatchLineup` — composition
- `MatchEvent` — événements live (buts, cartons, remplacements...)
- `MatchAttendance` — convocations et présences
- `MatchPlayerRating` — évaluations individuelles post-match

---

## Format de jeu — configurable par catégorie

Le nombre de périodes et leur durée ne sont pas fixés à 2×45 minutes. Ils sont hérités du
`Championship` associé (`Championship.numberOfPeriods`, `Championship.periodDurationMinutes`)
et peuvent être écrasés sur un `Match` individuel si nécessaire.

Exemples :
- Seniors : 2 × 45 min
- Juniors suisses (certaines catégories) : 4 × 20 min
- Toute autre configuration : entièrement configurable

---

## Cycle de vie d'un match

### 1. Création / préparation (avant le match)

**Deux chemins de création selon `matchType`** (décision actée le 2026-07-16, voir
`docs/roadmap.md` Phase 4 et `docs/schema/evenements.md` §Match) :
- `COUPE`/`AMICAL`/`TOURNOI` : l'entraîneur crée directement un événement de type `MATCH` depuis
  le Calendrier — date, heure, lieu, type, domicile/extérieur, et adversaire choisi dans la liste
  `ExternalTeam` du club (existante ou créée à la volée, même composant que le module
  Championnat). Si `COUPE`, la phase de la compétition (`cupRound` — 64e/32e/16e de finale,
  quart, demi, finale) est également saisie. Backend : `POST clubs/:clubId/teams/:teamId/matches`
  (`MatchesService.create`, A2) — crée l'`Event`+`Match` en une seule transaction, rejette
  explicitement `matchType = CHAMPIONNAT` (code `MATCHES.CHAMPIONNAT_NOT_DIRECT`). Même route pour
  lire/modifier/supprimer n'importe quel `matchType` (championnat inclus) une fois créé ;
  l'adversaire/la phase/le domicile-extérieur d'un match `CHAMPIONNAT` restent en lecture seule
  (`MATCHES.OPPONENT_NOT_EDITABLE`), dérivés du `ChampionshipMatch`.

  **Frontend (A4)** : `EventFormDialog` (composant partagé du Calendrier) affiche un sous-
  formulaire dédié (`MatchEventFields`) dès que le type `MATCH` est choisi, **en création
  uniquement** — sélecteur de type (Coupe/Amical/Tournoi, jamais Championnat), domicile/
  extérieur, adversaire (même flux liste-existante/création-à-la-volée que
  `AddParticipantDialog` du module Championnat, réutilise `ExternalTeamFormDialog`), et phase de
  coupe si `matchType = COUPE`. La case "Événement récurrent" est masquée pour ce type (un match
  ne se crée jamais en série). Le titre de l'événement est auto-rempli avec le nom de
  l'adversaire choisi (si encore vide), modifiable ensuite. **L'édition d'un match existant via ce
  dialogue générique n'est pas prise en charge** — `MATCH` est retiré du sélecteur de type en
  mode édition (une fiche match dédiée arrivera avec les Parties B-D) ; un événement déjà de type
  `MATCH` reste néanmoins éditable pour ses champs génériques (titre/date/lieu/description) via
  la route `Event` existante, sans toucher aux champs `Match`.
- `CHAMPIONNAT` : **jamais créé directement depuis le Calendrier**. Naît de la création d'un
  `ChampionshipMatch` dans le module Championnat (existant depuis la Phase 3) — celui-ci crée
  automatiquement l'`Event`+`Match` liés en une transaction, uniquement si l'une de nos équipes
  participe à la rencontre (une rencontre entre deux adversaires n'a pas de fiche match pour
  nous). Le Calendrier affiche ensuite ce match, sans permettre de le recréer.

  Implémenté en A3 (`ChampionshipMatchesService.createLinkedMatchIfOwnTeamInvolved`, appelé par
  `create` et `createBulk`) : `Event.title` = nom de l'adversaire uniquement (jamais de texte en
  dur type "vs"/"Match contre" — le back ne compose jamais de texte traduit, voir
  `docs/architecture.md` §3) ; `homeOrAway` dérivé de la position de notre équipe parmi les deux
  participants. `ChampionshipMatchesService.update` répercute un changement de `scheduledAt` sur
  l'`Event.startAt` lié (le reste — titre/lieu/description — n'a pas d'équivalent sur
  `ChampionshipMatch`, rien à répercuter). `remove` supprime le `Match`+`Event` lié avant la
  rencontre elle-même, pour ne jamais laisser de fiche match orpheline. **Le statut n'est
  volontairement pas synchronisé** entre `ChampionshipMatchStatus` et `LiveMatchStatus` — la
  clôture d'un match live (Partie C) reste l'unique flux qui fait passer un `Match` à `FINISHED`.

**Affichage dans le Calendrier (A5)** : un match (créé directement ou via le module Championnat,
A3) apparaît automatiquement dans les 3 vues (Liste/Mois/Semaine) comme n'importe quel `Event` —
aucun changement de rendu nécessaire, le code couleur/badge par type s'applique déjà tel quel.
**Garde-fous ajoutés** : ni la vue Liste (boutons Modifier/Supprimer) ni le clic sur la grille
Mois/Semaine n'ouvrent plus le dialogue générique d'édition/suppression pour un événement de type
`MATCH` — deux risques identifiés en implémentant A3/A4 :
- Éditer directement `Event.startAt`/`title` d'un match `CHAMPIONNAT` via ce dialogue
  désynchroniserait le calendrier du `ChampionshipMatch` (la propagation de date construite en A3
  ne va que dans le sens `ChampionshipMatch` → `Event`, jamais l'inverse).
- Supprimer directement l'`Event` échouerait de toute façon en base : `Match.eventId` est
  `ON DELETE RESTRICT` (docs/schema/evenements.md). Un garde-fou backend explicite a été ajouté au
  passage (`EventsService.assertNoLinkedMatch`, code `EVENTS.CANNOT_DELETE_LINKED_TO_MATCH`, 409)
  pour ne jamais renvoyer l'erreur de contrainte Postgres brute — même principe que
  `TeamsService.remove`/`TEAMS.CANNOT_DELETE_NOT_EMPTY`.

**Correctif B3** : la fiche match (ci-dessous) existant désormais, le masquage ci-dessus (provisoire
depuis A5) est complété par un vrai lien de consultation — trouvé en usage réel, la fiche n'était
reliée depuis aucun écran. `EventsService.findAllByTeam`/`findMineInClub` incluent désormais
`match: { select: { id: true } }` (`GET .../events`, `GET .../events/mine`) ; le frontend
(`ExistingEvent.match`) affiche un lien "Voir le match" (icône œil) à la place des boutons
Modifier/Supprimer en vue Liste, et navigue directement vers la fiche au clic sur la grille
Mois/Semaine — plutôt que de rouvrir le dialogue générique désactivé. **Point reporté** : badge
visuel enrichi dans le calendrier (type de match, score une fois joué) — nécessiterait d'exposer
aussi `matchType`/`scoreHome`/`scoreAway` dans ce même include, non fait ici pour rester ciblé sur
la navigation ; à reprendre si signalé comme un besoin réel.

**Convocations** : sélection des joueurs convoqués depuis l'effectif (statut `PENDING` dans
`MatchAttendance`). Les joueurs/parents répondent (`ACCEPTED`/`DECLINED`). Le signalement visuel
des joueurs blessés (`Injury.status = EN_COURS`) est **hors scope de la Phase 4** — `Injury`
n'existe pas avant la Phase 8, ce point y est reporté explicitement (confirmé avec l'utilisateur
le 2026-07-16).

Implémenté en B1 (`MatchAttendancesService`, `clubs/:clubId/teams/:teamId/matches/:matchId/
attendances`) :
- `POST .../attendances/bulk` — le Coach convoque plusieurs joueurs en une seule action (sélection
  depuis l'effectif), **idempotent** : un joueur déjà convoqué n'est jamais dupliqué ni
  réinitialisé, pour permettre d'ajouter des joueurs plus tard sans perdre les réponses déjà
  données. Vérifie l'appartenance de chaque joueur à l'équipe (`assertPlayerInTeam`).
- `GET .../attendances` — liste filtrée selon le scope de l'appelant : TEAM/CLUB/ALL (Coach/
  AdminClub/SuperAdmin) voient toutes les convocations ; OWN (Player) ne voit que la sienne ;
  PARENT (Parent) ne voit que celle de son enfant lié (`ParentChild`).
- `PATCH .../attendances/:id` — Coach/AdminClub/SuperAdmin modifient librement
  `convocationStatus`/`attendanceStatus` ; Player/Parent ne peuvent modifier que
  `convocationStatus` (jamais `attendanceStatus`, réservé au Coach) sur **leur propre**
  convocation (ou celle de leur enfant), jamais un retour à `PENDING`.
- `DELETE .../attendances/:id` — retire une convocation, Coach/AdminClub/SuperAdmin uniquement.

**Composition** (`MatchLineup`) : onze de départ, remplaçants (le statut `NON_CONVOQUE` reste
disponible dans l'enum mais n'est plus piloté depuis l'UI actuelle — voir B6 ci-dessous).

Implémenté en B2 (`MatchLineupsService`, `clubs/:clubId/teams/:teamId/matches/:matchId/lineups`) :
- `POST .../lineups/bulk` — la composition est **resoumise en une fois** à chaque édition (pas un
  ajout incrémental comme les convocations) : chaque ligne `{playerId, lineupStatus, position?,
  pitchSpotId?, shirtNumber?}` est upsert sur `(matchId, playerId)`, crée si le joueur n'a pas
  encore de ligne, met à jour sinon. `position`/`shirtNumber` sont propres à ce match, jamais lus
  depuis `PlayerTeam`. `pitchSpotId` ajouté en B6, voir plus bas.
- `GET .../lineups` — pas de scope OWN/PARENT ici (contrairement aux convocations) : Coach/
  AdminClub/SuperAdmin voient la composition, Player la voit également **en entier** (`match_lineup
  READ TEAM`, pas de filtrage à sa propre ligne), Parent n'y a aucun accès.
- `DELETE .../lineups/:id` — retire un joueur de la composition, Coach/SuperAdmin uniquement
  (AdminClub reste en lecture seule, cohérent avec "Préparer la composition ❌" du tableau de
  droits).

**Historique** : une première version (B3/B4) donnait à Convocations et Composition deux onglets
séparés, Composition affichée comme une liste de lignes avec sélecteurs poste/statut (et un
`AddToLineupDialog` pour ajouter un joueur, aujourd'hui supprimé). Retravaillée en B6 suite au
retour utilisateur du 2026-07-17 : la liste de Composition manquait de lisibilité visuelle et
faisait doublon avec les Convocations (deux écrans distincts pour préparer un seul et même
avant-match).

**Frontend (B6) — première fiche match** (`clubs/:clubId/teams/:teamId/matches/:matchId`) —
en-tête (adversaire = `event.title`, date/heure, type, domicile/extérieur, lieu, score une fois
joué, statut) + onglets, sur le modèle de la fiche joueur (`DETAIL_TABS` + placeholder "bientôt
disponible" pour Direct/Après-match, pas encore construits). Onglet unique **"Avant-match"** :
fusionne Convocations et Composition en une seule vue à deux colonnes (`PreMatchTab`), plutôt que
deux onglets séparés — les deux se complètent (composer nécessite de savoir qui a accepté) et se
consultent ensemble en pratique.

- **Colonne Convocations** (`ConvocationsTab`) : liste sous forme de lignes compactes (avatar +
  nom, pas un `Table` — seulement 2-3 informations par joueur, une vraie grille avec en-têtes de
  colonnes était disproportionnée), filtrée par `canManage` (renvoyé par `match_attendance`, pas
  `match` — voir note plus haut). Coach/AdminClub/SuperAdmin gèrent la liste complète : bouton
  "Convoquer des joueurs" (sélecteur multiple depuis l'effectif via `ConvenePlayersDialog`,
  réutilise le composant `Checkbox`), statut de convocation modifiable directement en un clic
  (groupe de 3 boutons icône En attente/Confirmé/Décliné, `lib/convocation-status.ts` pour le code
  couleur gris/vert/rouge — le backend autorise déjà le Coach à modifier librement
  `convocationStatus`, y compris un retour à `PENDING`, contrairement à Player/Parent), retrait
  avec confirmation. Un Player/Parent ne reçoit du backend QUE sa propre convocation (ou celle de
  son enfant, déjà filtrée côté service, A0/B1) et répond directement via deux boutons
  Accepter/Décliner, sans jamais avoir à déterminer côté frontend "est-ce la mienne ?". Gagne en B6
  un prop `onChange`, appelé après chaque rechargement réussi, pour prévenir le parent (`PreMatchTab`)
  qu'une convocation a changé — voir §Synchronisation ci-dessous.
- **Présence effective hors de cette colonne (décision du 2026-07-17)** : une première version
  (B3) exposait aussi ici un sélecteur d'`AttendanceStatus` (présent/absent excusé/absent
  non-excusé) à côté de la convocation. Retiré : avant que le match ait eu lieu,
  `AttendanceStatus` n'a aucune information à apporter en plus de `ConvocationStatus` (les deux
  racontent la même chose — "est-ce que ce joueur vient ?"), donc les deux se faisaient doublon.
  `AttendanceStatus` reste correctement scopé sur la **Partie D — Après-match** (§3 plus bas), où
  il aura un vrai sens : le constat réel de présence peut diverger de la réponse donnée avant match
  (accepté puis absent, décliné puis présent en dernière minute). Le endpoint
  `PATCH .../attendances/:id` accepte déjà `attendanceStatus` côté backend (implémenté en B1) —
  seule l'UI d'édition est différée, pas la permission ni la route.
- **Colonne Composition** (`CompositionColumn`) : terrain SVG interactif (`LineupPitch`) au lieu
  d'une liste — réutilise le même terrain stylisé que le sélecteur de poste de la fiche joueur
  (`components/players/position-pitch.tsx`, `POSITION_PITCH_SPOTS` dans `lib/positions.ts`),
  aucune coordonnée dupliquée. Le **banc** (joueurs disponibles pour la composition) n'est **pas**
  un statut persisté : c'est simplement "convocation acceptée, pas encore placé sur le terrain"
  (`ConvocationStatus.ACCEPTED` moins les lignes `MatchLineup` avec `pitchSpotId` non nul),
  recalculé à chaque rendu — c'est la "population automatique" demandée : accepter une convocation
  suffit à rendre un joueur disponible pour la composition, sans étape d'ajout manuelle
  supplémentaire (l'ancien `AddToLineupDialog` de B4 a été supprimé). Une ligne `MatchLineup`
  n'existe désormais que pour un joueur **effectivement placé** sur le terrain — le retirer
  supprime la ligne plutôt que de la repasser en `REMPLACANT` (rien à y stocker une fois hors du
  terrain), ce qui explique pourquoi `NON_CONVOQUE`/`REMPLACANT` restent dans l'enum sans être
  pilotables depuis cette UI (voir note sous le tableau `MatchLineup`).
- **Synchronisation entre les deux colonnes** : chaque colonne reste un composant indépendant qui
  fait son propre fetch (convention du projet, cohérente avec le reste de la fiche match) — pas
  d'état partagé. `PreMatchTab` maintient un simple compteur `refreshKey`, incrémenté via le
  `onChange` de `ConvocationsTab` à chaque rechargement réussi des convocations ; `CompositionColumn`
  refait sa propre requête `.../attendances` quand `refreshKey` change, pour garder le banc à jour
  sans dupliquer l'état des convocations.
- **Glisser-déposer fait maison** (`LineupPitch`), Pointer Events, **aucune dépendance ajoutée**
  (décision du 2026-07-17, confirmée avec l'utilisateur — alternative envisagée : `@dnd-kit`) :
  presser un joueur (banc ou déjà placé) puis le faire glisser sur un point du terrain le place à
  ce poste ; le faire glisser vers le banc le retire du terrain. **Repli clic** systématique en
  complément du glisser (sélectionner un joueur d'un clic puis cliquer sa destination) — nécessaire
  pour le clavier/l'accessibilité, et c'est aussi la voie empruntée par les tests (jsdom
  n'implémente pas `elementFromPoint`, utilisé uniquement pour le hit-testing du drag réel ; les
  deux chemins — `endDrag` après un vrai glisser, gestionnaires `onClick` sinon — sont mutuellement
  exclusifs via un drapeau `suppressClickRef` pour éviter un double traitement du même geste).
- **Deux joueurs au même poste** (ex. 2 `CB`) : `pitchSpotId` (nouveau champ `MatchLineup`, B6,
  ex. `"cb-left"`/`"cb-right"`) épingle chaque joueur à un point précis et distinct du terrain,
  indépendamment de `position` (le poste "métier", qui peut être identique pour les deux) — décision
  du 2026-07-17, alternative envisagée et écartée : recalculer gauche/droite à l'affichage sans
  champ dédié (plus simple mais moins stable, pas de garantie qu'un même joueur reste toujours au
  même point). Contrainte `@@unique([matchId, pitchSpotId])` : impossible que deux joueurs occupent
  le même point sur un même match (les lignes `pitchSpotId = null`, c'est-à-dire tous les joueurs
  non placés, ne sont jamais en conflit entre elles — PostgreSQL traite plusieurs `NULL` comme
  distincts dans une contrainte unique). Le frontend bloque aussi côté client (toast d'erreur) une
  tentative de dépôt sur un point déjà occupé par un *autre* joueur, pour ne jamais déclencher
  cette contrainte côté serveur.
- **Numéro de maillot** : conservé comme un champ texte éditable, affiché dans une liste
  "Titulaires" sous le terrain (un joueur placé = une ligne avec poste + numéro + bouton retirer),
  complément lisible/accessible au terrain visuel.
- **Droits** : Coach/SuperAdmin composent (glisser-déposer, numéro, retrait) ; AdminClub/Player
  voient le terrain et la liste des titulaires en lecture seule (pas de banc affiché, inutile sans
  interaction possible) ; Parent n'a aucun accès à `match_lineup` — le fetch échoue et la colonne
  affiche l'état d'erreur générique.

---

### 2. Match en live

#### Lancement et gestion des périodes

Le coach clique **"Lancer la période 1"**. Le serveur enregistre `MatchPeriod.startedAt`
(timestamp serveur, pas côté client). La minute affichée dans l'UI est **toujours recalculée
côté client** : `Math.floor((now - period.startedAt) / 60)`. Si l'app est fermée et rouverte,
la minute repart correctement depuis le timestamp serveur.

Flux complet pour 2×45 min :
1. Coach → "Lancer période 1" → `MatchPeriod(periodNumber=1, startedAt=T1)`
2. Coach → "Fin période 1" → `MatchPeriod(endedAt=T2)`, `Match.status = HALFTIME`
3. Coach → "Lancer période 2" → `MatchPeriod(periodNumber=2, startedAt=T3)`
4. Coach → "Fin période 2" → `MatchPeriod(endedAt=T4)`, `Match.status = FINISHED`

Pour 4×20 min, le même flux s'applique avec 4 `MatchPeriod`. L'UI affiche le numéro de période
en cours. **MVP : un seul utilisateur gère le live** (l'app ne gère pas la concurrence en temps
réel avant une phase ultérieure).

#### Événements live (`MatchEvent`)

| Type | `playerId` (notre joueur) | `relatedPlayerId` | `externalPlayerId` |
|---|---|---|---|
| `GOAL` (notre équipe) | Buteur | Passeur décisif (nullable) | — |
| `OWN_GOAL` (notre équipe) | Auteur | — | — |
| `GOAL` (adversaire) | — | — | Buteur adverse (nullable) |
| `YELLOW_CARD` (notre joueur) | Joueur cartonné | — | — |
| `YELLOW_CARD` (adversaire) | — | — | Joueur adverse (nullable) |
| `RED_CARD` (notre joueur) | Joueur cartonné | — | — |
| `RED_CARD` (adversaire) | — | — | Joueur adverse (nullable) |
| `SUBSTITUTION` | Joueur entrant | Joueur sortant | — |
| `PENALTY_SCORED` | Tireur | — | — |
| `PENALTY_MISSED` | Tireur | — | — |

**L'assist n'est pas un événement séparé** : c'est `relatedPlayerId` sur l'événement `GOAL`.
Cela évite d'avoir un assist sans but correspondant et simplifie les requêtes de statistiques.

Chaque `MatchEvent` porte aussi :
- `periodNumber` : dans quelle période l'événement s'est produit.
- `minute` : calculé ou saisi manuellement.
- `teamSide` : `HOME` ou `AWAY`.

#### Clôture du match

À la fin de la dernière période, le coach clique **"Clore le match"** :
1. `Match.status` passe à `FINISHED`.
2. Le score est calculé depuis les `MatchEvent` de type `GOAL`/`OWN_GOAL` et écrit sur :
   - `ChampionshipMatch.scoreHome/Away` si c'est un match de championnat.
   - `Match.scoreHome/Away` si c'est un match amical.
3. Le classement du championnat est actualisé à la prochaine requête (calculé à la volée).

**Correction post-match** : l'entraîneur peut corriger un score ou ajouter un événement manqué.
Le score est recalculable à tout moment depuis les événements.

---

### 3. Après le match

- **Présences effectives** : confirmer/corriger les `AttendanceStatus`. C'est ici — et
  uniquement ici — que l'édition de la présence a du sens (voir la décision du 2026-07-17
  documentée §1 Convocations : avant le match, `AttendanceStatus` ferait doublon avec
  `ConvocationStatus`).
- **Évaluation collective** : `Match.globalRating` (sur 10) + `Match.globalComment`.
- **Évaluations individuelles** (`MatchPlayerRating`) : note sur 10 + commentaire par joueur.

**Point futur (hors scope Phase 4, nécessite le système de notifications)** : un joueur qui n'a
jamais répondu à sa convocation (`ConvocationStatus` resté `PENDING`) devrait automatiquement
passer en `AttendanceStatus = ABSENT_NON_EXCUSE` une fois un délai de réponse dépassé — sans
notification avec délai/rappel (pas encore implémentée), il n'y a rien de fiable sur quoi baser
ce délai. À reprendre quand le système de notifications sera construit ; à ce moment-là, on
pourra aussi envisager un pré-remplissage automatique `ConvocationStatus = DECLINED` →
`AttendanceStatus = ABSENT_EXCUSE` (le joueur a prévenu à l'avance), tout en laissant `ACCEPTED`
sans présomption (accepter ne prouve pas la présence réelle, seul le constat du Coach le jour du
match fait foi).

---

## Statistiques calculées depuis `MatchEvent`

Toutes les stats individuelles sont calculées à la volée, jamais stockées en colonnes
dénormalisées. Sources de calcul :

| Statistique | Calcul |
|---|---|
| Buts d'un joueur | `COUNT(MatchEvent) WHERE type=GOAL AND playerId=X` |
| Passes décisives d'un joueur | `COUNT(MatchEvent) WHERE type=GOAL AND relatedPlayerId=X` |
| Cartons jaunes | `COUNT(MatchEvent) WHERE type=YELLOW_CARD AND playerId=X` |
| Cartons rouges | `COUNT(MatchEvent) WHERE type=RED_CARD AND playerId=X` |
| Temps de jeu | Titulaire : début période 1 → substitution sortie (ou fin de match). Remplaçant : substitution entrée → fin de match. Calculé depuis `MatchPeriod` + `MatchEvent SUBSTITUTION`. |
| Moyenne de notes | `AVG(MatchPlayerRating.score) WHERE playerId=X` |

Ces statistiques sont filtrables par `Season`, `Championship`, ou toutes périodes confondues.

---

## Droits par rôle

| Action | Coach (son équipe) | AdminClub | SuperAdmin / Propriétaire | Player | Parent |
|---|---|---|---|---|---|
| Créer / modifier un match | ✅ | ✅ | ✅ | ❌ | ❌ |
| Préparer la composition | ✅ | ❌ | ✅ | ❌ | ❌ |
| Gérer le live (périodes + événements) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Clore le match | ✅ | ❌ | ✅ | ❌ | ❌ |
| Répondre à une convocation | ❌ | ❌ | ❌ | ✅ (le sien) | ✅ (son enfant) |
| Saisir présences effectives | ✅ | ❌ | ✅ | ❌ | ❌ |
| Évaluation collective + individuelle | ✅ | ❌ | ✅ | ❌ | ❌ |
| Voir la fiche match complète | ✅ | ✅ | ✅ | ✅ (résultat + sa note) | ✅ (résultat) |
| Supprimer un match | ✅ | ✅ | ✅ | ❌ | ❌ |

**Parent** : les droits « son enfant » ci-dessus s'appuient désormais sur la liaison `ParentChild`
et le scope `PermissionScope.PARENT` (décision ouverte #5, tranchée — voir
`docs/modules/auth-roles.md` §Rôle Parent), câblés dès l'étape A0 de la Phase 4. Un Parent n'a
droit **qu'au résultat** du match de son enfant (`match READ PARENT`) et à répondre à sa
convocation (`match_attendance READ`/`UPDATE PARENT`) — pas à la composition, aux événements de
match ni à l'évaluation individuelle, plus restrictif que le scope `OWN` de l'enfant lui-même
(Player). Cohérent avec la posture déjà adoptée sur `championship` en Phase 3 (Parent volontairement
tenu à l'écart des sous-ressources non essentielles).

**Permissions scindées en 6 ressources distinctes** (`match`, `match_lineup`, `match_period`,
`match_event`, `match_attendance`, `match_player_rating`), pas une seule `match` globale — la
table de droits ci-dessus mélange des actions qu'un seul rôle générique ne peut pas exprimer :
AdminClub a un droit complet sur la fiche `match` (créer/modifier/supprimer) mais seulement la
**lecture** sur toutes les sous-ressources (composition, live, présences, évaluation) —
contrairement à Coach/SuperAdmin qui ont le CRUD complet sur tout. Voir `backend/prisma/seed.ts`
pour le détail par rôle (étape A0, Phase 4).

**`canManage` par ressource, pas un seul `canManage` global** — conséquence directe du
paragraphe ci-dessus : `MatchesService.findOne` (`match`), `MatchAttendancesService
.findAllByMatch` (`match_attendance`) et `MatchLineupsService.findAllByMatch` (`match_lineup`)
calculent chacun leur propre `canManage` (vérifié contre la permission `CREATE` de LEUR ressource
respective) plutôt que de réutiliser celui d'une autre — trouvé en préparant la fiche match (B3)
avant même d'écrire le frontend : un AdminClub a `match.canManage = true` mais
`match_attendance.canManage = false` et `match_lineup.canManage = false`, les trois auraient été
incorrectement confondus par un seul booléen partagé.

---

## Lien avec les autres modules

- **Calendrier** : le match est un `Event`, affiché avec le code couleur approprié.
- **Championnat** : `Match.championshipMatchId` → `ChampionshipMatch`. Score de référence sur
  `ChampionshipMatch`. Mise à jour du classement à la clôture.
- **Effectif** : `MatchPlayerRating` et `MatchEvent` enrichissent le profil joueur (stats,
  dashboard).
- **Blessures** : joueurs blessés signalés lors de la préparation de la composition.
- **Scouting** : un `TeamScoutingReport` ou `PlayerScoutingReport` peut être rattaché à un
  `ChampionshipMatch` (`championshipMatchId` nullable, optionnel). Voir `docs/schema/scouting.md`.
