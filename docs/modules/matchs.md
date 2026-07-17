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

## Périodes de jeu — configurable par catégorie

Le nombre de périodes et leur durée ne sont pas fixés à 2×45 minutes. Ils sont hérités du
`Championship` associé (`Championship.numberOfPeriods`, `Championship.periodDurationMinutes`)
et peuvent être écrasés sur un `Match` individuel si nécessaire.

Exemples :
- Seniors : 2 × 45 min
- Juniors suisses (certaines catégories) : 4 × 20 min
- Toute autre configuration : entièrement configurable

---

## Format de jeu — nombre de joueurs sur le terrain (Phase 4, B10, 2026-07-17)

À ne pas confondre avec les **périodes de jeu** ci-dessus (durée/nombre de périodes) : le
**format de jeu** (`GameFormat`) désigne le nombre de joueurs sur le terrain par équipe, gardien
inclus — 4, 5, 6, 7, 8, 9 ou 11. Chaque équipe a une **catégorie d'âge** (`Team.category`,
`docs/schema/fondations.md`, ex. U13) qui joue habituellement dans un format donné (ex. U13 → 9),
mais rien n'impose ce lien : un club peut vouloir faire jouer ses U13 en 11 contre 11 pour
préparer la saison suivante (cas prévu explicitement, décision du 2026-07-17).

**Résolution du format effectif d'un match** — même logique de surcharge que les périodes de
jeu :
1. Match CHAMPIONNAT : `Match.gameFormat` s'il est renseigné, sinon `Championship.gameFormat`
   (champ obligatoire du formulaire de création du championnat, ELEVEN par défaut — pas de
   préremplissage automatique depuis la catégorie de l'équipe organisatrice à ce stade, toujours
   modifiable).
2. Match AMICAL/COUPE/TOURNOI (créé directement) : `Match.gameFormat`, préempli depuis la
   catégorie de l'équipe sélectionnée (`frontend/src/lib/game-formats.ts`,
   `CATEGORY_DEFAULT_GAME_FORMAT` — ex. U13 → 9) au moment de l'ouverture du formulaire, toujours
   modifiable ensuite.

Le format pilote la liste des systèmes tactiques proposés dans l'onglet Composition
(`frontend/src/lib/formations.ts` §Composition, B10) — un système 9 joueurs (`3-3-2`) n'a pas de
sens pour un match en format 11, et inversement. Identifiants sans chiffre de gardien pour tous
les formats (`3-3-2`, pas `1-3-3-2`), même convention que le 11 contre 11 (`4-4-2`).

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

**Composition** (`MatchLineup`) : onze de départ (`TITULAIRE`), non retenus (`NON_CONVOQUE`,
piloté depuis l'UI à partir de B8, voir plus bas) — `REMPLACANT` reste dans l'enum mais n'est
piloté par aucune UI : le "banc" de B6/B7/B8 est un état dérivé (convocation acceptée, pas encore
placé), jamais persisté sous ce statut.

Implémenté en B2 (`MatchLineupsService`, `clubs/:clubId/teams/:teamId/matches/:matchId/lineups`) :
- `POST .../lineups/bulk` — la composition est **resoumise en une fois** à chaque édition (pas un
  ajout incrémental comme les convocations) : chaque ligne `{playerId, lineupStatus, position?,
  pitchSpotId?, shirtNumber?, isCaptain?}` est upsert sur `(matchId, playerId)`, crée si le joueur
  n'a pas encore de ligne, met à jour sinon. `position`/`shirtNumber` sont propres à ce match,
  jamais lus depuis `PlayerTeam`. `pitchSpotId` ajouté en B6, `isCaptain` en B8, voir plus bas.
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

**Frontend (B6/B7) — première fiche match** (`clubs/:clubId/teams/:teamId/matches/:matchId`) —
en-tête (adversaire = `event.title`, date/heure, type, domicile/extérieur, lieu, score une fois
joué, statut) + onglets, sur le modèle de la fiche joueur (`DETAIL_TABS` + placeholder "bientôt
disponible" pour Direct/Après-match, pas encore construits). Onglet unique **"Avant-match"** :
fusionne Convocations et Composition en une seule vue à **3 colonnes inégales** (`PreMatchTab`,
grid `[0.9fr_1.3fr_0.8fr]`) — Convocations/Composition/Banc — plutôt que des onglets séparés : les
trois se complètent (composer nécessite de savoir qui a accepté) et se consultent ensemble en
pratique. Largeurs inégales et Banc isolé du terrain en sa propre colonne : correctif B7
(2026-07-17, retour utilisateur sur capture d'écran) — la première version B6 avait une colonne
Convocations trop large (2 colonnes égales) et un terrain carré étiré sur toute la largeur de sa
colonne (viewBox `100×100` sans borne de taille), rendant le Banc — affiché sous le terrain —
difficile à repérer. Le terrain est maintenant borné (`max-w-xs`) et le Banc vit dans sa propre
colonne, toujours visible sans avoir à défiler sous un terrain démesuré.

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
- **Colonnes Composition + Banc** (`CompositionColumn`) : un seul composant qui retourne un
  fragment de 2 éléments (`<>...</>`) — Composition (sélecteur de système + terrain) et Banc —
  placés directement comme 2 des 3 colonnes du grid par `PreMatchTab`, toujours exactement 2
  éléments retournés (y compris en chargement/erreur) pour que le nombre de colonnes reste stable.
- **Système tactique** (`Match.formation`, B8 — ex. `"4-3-3"`) : sélecteur en tête de colonne
  Composition (Coach/SuperAdmin uniquement), `frontend/src/lib/formations.ts` définit ~6 systèmes
  courants (4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2), chacun exactement 11 points (`FormationSlot`
  — remplace le référentiel générique `POSITION_PITCH_SPOTS` de la fiche joueur, plus utilisé ici
  depuis B8). Les identifiants de point (`"def-1".."def-5"`, `"mid-1".."mid-5"`, `"fwd-1".."fwd-3"`,
  `"gk"`) sont volontairement génériques et partagés entre toutes les formations — un joueur à
  `"def-2"` dans un 4-4-2 reste sur `"def-2"` en passant à un 3-5-2 (qui définit aussi ce point),
  avec de nouvelles coordonnées automatiquement. **Changer de système "conserve les joueurs
  compatibles"** (décision du 2026-07-17, alternative envisagée et écartée : tout vider à chaque
  changement) : `CompositionColumn.handleFormationChange` calcule l'ensemble des points de la
  nouvelle formation, retire (`DELETE`) uniquement les titulaires dont le point n'existe plus dans
  cette formation (ex. `"def-5"` en passant d'un 5-3-2 à un 4-3-3), toast récapitulatif si des
  joueurs sont ainsi renvoyés au banc — les autres gardent leur `pitchSpotId` tel quel, donc leur
  poste et leurs coordonnées se mettent à jour tout seuls au prochain rendu, sans action
  supplémentaire.
- **Terrain SVG interactif** (`PitchSvg`) au lieu d'une liste. Le **banc** (`BenchList`, joueurs
  disponibles pour la composition) n'est **pas** un statut persisté par défaut : c'est simplement
  "convocation acceptée, pas encore placé sur le terrain, pas marqué non retenu" — recalculé à
  chaque rendu, c'est la "population automatique" demandée : accepter une convocation suffit à
  rendre un joueur disponible, sans étape d'ajout manuelle (l'ancien `AddToLineupDialog` de B4 a
  été supprimé en B6). Une ligne `MatchLineup` n'existe que pour un joueur **effectivement placé**
  (`pitchSpotId` non nul) ou **marqué non retenu** (`lineupStatus = NON_CONVOQUE`, voir plus bas) —
  retirer du terrain ou remettre un non-retenu disponible supprime simplement la ligne.
- **Synchronisation entre les colonnes** : chacune reste un composant indépendant qui fait son
  propre fetch (convention du projet, cohérente avec le reste de la fiche match) — pas d'état
  partagé. `PreMatchTab` maintient un simple compteur `refreshKey`, incrémenté via le `onChange`
  de `ConvocationsTab` à chaque rechargement réussi des convocations ; `CompositionColumn` refait
  sa propre requête `.../attendances` (et `.../matches/:matchId` pour le système tactique) quand
  `refreshKey` change, pour garder Composition et Banc à jour sans dupliquer l'état des
  convocations. `PitchSvg`/`BenchList` partagent quant à eux la sélection/le geste de glisser via
  un hook commun (`usePitchInteractions`, état centralisé plutôt que porté par un seul composant
  terrain — condition pour pouvoir séparer terrain et banc en deux colonnes distinctes tout en
  gardant l'interaction cohérente entre elles, ex. sélectionner un joueur dans le Banc puis cliquer
  un point du terrain).
- **Glisser-déposer fait maison** (`usePitchInteractions`), Pointer Events, **aucune dépendance
  ajoutée** (décision du 2026-07-17, confirmée avec l'utilisateur — alternative envisagée :
  `@dnd-kit`) : presser un joueur (banc ou déjà placé) puis le faire glisser sur un point du
  terrain le place à ce poste ; le faire glisser vers le banc le retire du terrain. **Repli clic**
  systématique en complément du glisser (sélectionner un joueur d'un clic puis cliquer sa
  destination) — nécessaire pour le clavier/l'accessibilité, et c'est aussi la voie empruntée par
  les tests (jsdom n'implémente pas `elementFromPoint`, utilisé uniquement pour le hit-testing du
  drag réel ; les deux chemins — pointerup global après un vrai glisser, gestionnaires `onClick`
  sinon — sont mutuellement exclusifs via un drapeau `suppressClickRef` pour éviter un double
  traitement du même geste).
- **Fiabilité et retour visuel du glisser** (B9, retour utilisateur du 2026-07-17 : glisser-déposer
  entre deux points du terrain peu fiable, pas de retour visuel pendant le geste) : le suivi du
  geste (`pointermove`/`pointerup`/`pointercancel`) est désormais posé sur `window` au
  `pointerdown` plutôt que sur chaque élément via `setPointerCapture` — un seul point d'écoute
  global, indépendant de la frontière DOM banc/SVG et des éventuelles limites de support de la
  capture de pointeur sur des éléments SVG selon les navigateurs. Retour visuel renforcé pendant le
  geste : jeton flottant façon avatar (initiales + nom) suivant le curseur plutôt qu'une simple
  étiquette texte, point survolé mis en évidence (vert si dépôt valide, rouge si déjà occupé par un
  *autre* joueur), Banc mis en évidence au survol pour un retrait du terrain.
- **Deux joueurs au même poste** (ex. 2 `CB`) : `pitchSpotId` (champ `MatchLineup`, B6) épingle
  chaque joueur à un point précis et distinct du terrain, indépendamment de `position` (le poste
  "métier", identique pour les deux — dérivé de la ligne du point via `LINE_TO_POSITION`, une
  valeur représentative par ligne GK/DEF/MID/FWD plutôt qu'une correspondance fine à maintenir).
  Contrainte `@@unique([matchId, pitchSpotId])` : impossible que deux joueurs occupent le même
  point sur un même match (les lignes `pitchSpotId = null` ne sont jamais en conflit entre elles —
  PostgreSQL traite plusieurs `NULL` comme distincts). Le frontend bloque aussi côté client (toast
  d'erreur) une tentative de dépôt sur un point déjà occupé par un *autre* joueur.
- **Barre d'actions contextuelle du titulaire sélectionné** (B8, remplace l'ancienne liste
  "Titulaires" toujours affichée — retour utilisateur du 2026-07-17 : "on sait déjà qu'il est
  titulaire, ça fait doublon avec le terrain", "pas assez dynamique") : cliquer un point occupé le
  sélectionne (surbrillance ambre, cohérent avec la sélection banc→terrain) et fait apparaître sous
  le terrain une barre avec le numéro de maillot (champ éditable), le bouton "Nommer
  capitaine"/"Retirer le brassard" et le retrait du terrain — disparaît dès qu'une action est prise
  ou qu'un autre joueur est sélectionné, plutôt qu'un tableau statique en permanence à l'écran.
- **Capitaine** (`MatchLineup.isCaptain`, B8) : badge étoile ambre affiché en incrustation sur le
  point du terrain du capitaine (lecture seule pour tous les rôles). Désignation réservée aux
  titulaires (décision du 2026-07-17, alternative envisagée : n'importe quel convoqué même sur le
  banc) — au plus un capitaine par match, invariant maintenu par `MatchLineupsService` (voir
  `docs/schema/evenements.md` §MatchLineup) : désigner un nouveau capitaine retire automatiquement
  le brassard du précédent en une seule requête.
- **Non retenu** (`LineupStatus.NON_CONVOQUE`, B8 — ex. joueur présent mais surnuméraire) :
  sélectionner un joueur du banc fait apparaître l'action "Marquer non retenu" ; les joueurs ainsi
  marqués rejoignent une section séparée "Non retenus" sous le banc (pour ne pas les mélanger aux
  joueurs réellement disponibles), avec l'action inverse "Remettre disponible" (supprime
  simplement la ligne `MatchLineup`).
- **Identité + numéro affichés ensemble** (B9, retour utilisateur du 2026-07-17 : une fois un
  numéro renseigné, plus moyen de savoir qui est le joueur sans cliquer dessus) : chaque point
  occupé affiche désormais les initiales (identité, toujours visibles) **et** le numéro de maillot
  s'il est renseigné (`#N`, texte plus petit juste en dessous) — jamais l'un à la place de l'autre.
- **Terrain dimensionné par la hauteur disponible** (B9, retour utilisateur du 2026-07-17 : trop
  petit après le passage à une largeur bornée en B7) : `h-full`/`aspect-square` plutôt que
  `w-full`/`max-w-xs` — le terrain grandit jusqu'à occuper toute la hauteur que lui laisse sa
  colonne (même chaîne `min-h-0`/`flex-1` que la colonne Convocations, B8, désormais aussi
  appliquée à la colonne Composition).
- **Droits** : Coach/SuperAdmin composent (système, glisser-déposer, numéro, capitaine, non-retenu,
  retrait) ; AdminClub/Player voient le terrain en lecture seule (pas de sélecteur de système, pas
  de banc affiché — inutiles sans interaction possible) ; Parent n'a aucun accès à `match_lineup` —
  le fetch échoue et la colonne affiche l'état d'erreur générique.
- **Colonne Convocations bornée + défilement interne** (B8, retour utilisateur sur capture d'écran
  du 2026-07-17 : une longue liste de convocations faisait défiler toute la page). Chaîne
  `lg:h-full`/`lg:min-h-0`/`lg:flex-1` reprise telle quelle depuis `players/[playerId]/page.tsx`
  (page → `Tabs`/`TabsContent` → grid `PreMatchTab` → colonne Convocations → liste dans
  `ConvocationsTab`, seule zone avec `lg:overflow-y-auto`) : le bouton "Convoquer des joueurs" reste
  fixe pendant que seule la liste défile, bornée à l'espace réellement disponible sous le header de
  l'app plutôt qu'à la hauteur de son contenu. Composition/Banc ne reçoivent pas ce traitement —
  non signalés comme problématiques (terrain de taille bornée, banc généralement court).

---

### 2. Match en live

#### Lancement et gestion des périodes

Le coach clique **"Lancer la période 1"**. Le serveur enregistre `MatchPeriod.startedAt`
(timestamp serveur, pas côté client). La minute affichée dans l'UI est **toujours recalculée
côté client** : `Math.floor((now - period.startedAt) / 60)`. Si l'app est fermée et rouverte,
la minute repart correctement depuis le timestamp serveur.

Flux complet pour 2×45 min :
1. Coach → "Lancer période 1" → `MatchPeriod(periodNumber=1, startedAt=T1)`, `Match.status = LIVE`
2. Coach → "Fin période 1" → `MatchPeriod(endedAt=T2)`, `Match.status = HALFTIME`
3. Coach → "Lancer période 2" → `MatchPeriod(periodNumber=2, startedAt=T3)`, `Match.status = LIVE`
4. Coach → "Fin période 2" → `MatchPeriod(endedAt=T4)`, `Match.status = HALFTIME`
5. Coach → "Clore le match" (§Clôture ci-dessous) → `Match.status = FINISHED` + calcul du score

Pour 4×20 min, le même flux s'applique avec 4 `MatchPeriod`. L'UI affiche le numéro de période
en cours. **MVP : un seul utilisateur gère le live** (l'app ne gère pas la concurrence en temps
réel avant une phase ultérieure).

**Terminer une période fait toujours passer `Match.status` à `HALFTIME`, y compris pour la
DERNIÈRE période configurée** (implémenté en C1, décision du 2026-07-18) : la transition vers
`FINISHED` est un geste explicite et distinct ("Clore le match", §Clôture du match ci-dessous),
jamais un effet de bord automatique de la fin de la dernière période — permet à l'entraîneur de
revoir/corriger avant clôture définitive.

**Backend (C1)** — `MatchPeriodsService`, `clubs/:clubId/teams/:teamId/matches/:matchId/periods` :
- `POST .../periods/start` (`match_period CREATE`) — démarre la période suivante
  (`periodNumber` calculé serveur = dernière période + 1), `startedAt` = timestamp serveur.
  Rejette si une période est déjà ouverte (`MATCH_PERIODS.ALREADY_OPEN`) ou si le match n'est
  plus actif (`MATCH_PERIODS.MATCH_NOT_ACTIVE` — terminé/annulé/reporté).
- `PATCH .../periods/:id/end` (`match_period UPDATE`) — termine la période visée, `endedAt` =
  timestamp serveur. Rejette une période déjà terminée (`MATCH_PERIODS.ALREADY_ENDED`).
- `GET .../periods` (`match_period READ`) — liste les périodes du match, triées par
  `periodNumber`. Player a aussi `match_period READ TEAM` (suit le déroulé, ne gère rien) ;
  AdminClub `READ CLUB` uniquement ; Parent aucun accès (absent de son jeu de permissions,
  contrairement à `match` scope `PARENT` qui donne uniquement le résultat final).
- **Pas de plafond serveur sur le nombre de périodes démarrables** (ex. via `Match.numberOfPeriods`
  résolu) : ce champ n'est aujourd'hui renseigné nulle part côté frontend pour un match créé
  directement (aucun champ dédié dans `EventFormDialog`, contrairement à `gameFormat` depuis B10),
  une résolution serait donc incomplète. Le frontend (C4) masquera simplement "Lancer la période
  suivante" une fois le nombre configuré atteint — pas une garde serveur dure pour l'instant.

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
- `teamSide` : `HOME` ou `AWAY` — "notre équipe" vs "adversaire" se déduit en comparant
  `teamSide` à `Match.homeOrAway`, jamais stocké séparément.

**Backend (C2)** — `MatchEventsService`, `clubs/:clubId/teams/:teamId/matches/:matchId/events`,
CRUD complet (Coach/SuperAdmin TEAM/ALL, AdminClub/Player `READ` seul, Parent aucun accès — mêmes
scopes que `match_period`, permissions déjà seedées en A0) :
- `POST .../events` (`CREATE`), `GET .../events` (`READ`, triés période puis minute),
  `PATCH .../events/:id` (`UPDATE`), `DELETE .../events/:id` (`DELETE`).
- `type`/`teamSide` immuables après création (même convention que `Match.matchType`) : un
  événement mal typé se supprime et se recrée. `PATCH` ne corrige que
  `periodNumber`/`minute`/`playerId`/`relatedPlayerId`/`externalPlayerId`/`comment` — les
  références joueur restent re-validées contre le `type`/`teamSide` existant.
- **Validation des références selon `type` et le côté** (tableau ci-dessus) : `OWN_GOAL`,
  `SUBSTITUTION`, `PENALTY_SCORED`, `PENALTY_MISSED` sont réservés à notre équipe (pas de pendant
  "adversaire" documenté — pas trackés côté adverse dans ce MVP). Côté "notre équipe",
  `playerId` est requis et vérifié appartenir à l'équipe (`assertPlayerInTeam`), jamais
  d'`externalPlayerId` ; `relatedPlayerId` n'est permis que pour `GOAL` (passeur). Côté
  adversaire, jamais de `playerId`/`relatedPlayerId`, et **`externalPlayerId` reste TOUJOURS
  optionnel** (retour utilisateur du 2026-07-18 : "je ne veux pas m'imposer un joueur adverse...
  je veux pouvoir rester global uniquement sur l'équipe adverse") — un but/carton adverse peut
  être enregistré sans nommer de joueur suivi.
- **Aucune restriction basée sur `Match.status`** (contrairement à `MatchPeriodsService`) : "le
  score est recalculable à tout moment depuis les événements" (§Clôture ci-dessous) — ajouter un
  événement manqué ou corriger une erreur reste possible après la clôture du match. La Partie C,
  C5 ("correction post-match") n'ajoute donc pas de nouvelle capacité backend, seulement une
  interface frontend dédiée accessible depuis l'onglet Après-match.

#### Clôture du match

À la fin de la dernière période, le coach clique **"Clore le match"** :
1. `Match.status` passe à `FINISHED`.
2. Le score est calculé depuis les `MatchEvent` de type `GOAL`/`OWN_GOAL` et écrit sur :
   - `ChampionshipMatch.scoreHome/Away` (+ `status = FINISHED`) si c'est un match de championnat.
   - `Match.scoreHome/Away` si c'est un match amical/coupe/tournoi.
3. Le classement du championnat est actualisé à la prochaine requête (calculé à la volée) — le
   filtre `ChampionshipsService.getStandings` ne retient que les `ChampionshipMatch`
   `status = FINISHED` (pas seulement un score non-null), d'où l'écriture du statut en plus du
   score à l'étape 2.

**Backend (C3)** — `MatchesService.close`, `POST clubs/:clubId/teams/:teamId/matches/:matchId/close`,
gardé par `match_period UPDATE` (pas `match UPDATE` : "Clore le match" est ❌ pour AdminClub dans
le tableau de droits ci-dessus, alors qu'AdminClub a le CRUD complet sur `match` — réutiliser
`match UPDATE` aurait ouvert la clôture à AdminClub par erreur) :
- **Calcul du score** : `COUNT(GOAL WHERE teamSide = Match.homeOrAway)` pour notre équipe,
  `COUNT(GOAL WHERE teamSide ≠ homeOrAway) + COUNT(OWN_GOAL)` pour l'adversaire (un csc de notre
  équipe profite toujours à l'adversaire — `OWN_GOAL` est réservé à notre équipe, voir §Événements
  live ci-dessus). **`PENALTY_SCORED`/`PENALTY_MISSED` ne comptent jamais dans le score** —
  réservés à une séance de tirs au but (qui départage sans s'ajouter au score de la rencontre,
  convention football standard "2-2, 4-3 aux tirs au but"), jamais lus par `close`.
- **Garde-fous** : rejette si le match est déjà `FINISHED`/`CANCELLED`/`POSTPONED`
  (`MATCHES.MATCH_NOT_ACTIVE`) ou si une période est encore ouverte, `startedAt` non-nul et
  `endedAt` nul (`MATCHES.PERIOD_STILL_OPEN`) — pas de vérification que TOUTES les périodes
  configurées ont été jouées (même raisonnement que `MatchPeriodsService`, C1 : `numberOfPeriods`
  n'est résolu nulle part côté backend aujourd'hui).
- **Gap connu, non traité ici** : `ChampionshipMatchesService.update` (saisie manuelle d'un
  résultat) n'a aucun garde-fou empêchant d'écraser le score/statut d'un `ChampionshipMatch` lié à
  un `Match` que le Coach gère en live — l'intention documentée plus haut ("le statut n'est
  volontairement pas synchronisé... la clôture live reste l'unique flux qui fait passer un Match à
  FINISHED") n'est pas encore appliquée à ce second flux d'écriture. À reprendre si un cas réel
  de désynchronisation est signalé.

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
