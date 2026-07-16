# Module — Gestion de l'effectif

> **État d'implémentation (Phase 2)** : liste de l'effectif par équipe, navigation
> club → équipe → effectif, et fiche joueur (panneau d'informations + sélecteur de poste)
> sont construits. **Décision du 2026-07-06** : contrairement au découpage initial (tous les
> onglets renvoyés en Phase 6/8), Mesures/Évaluation/Objectifs/Entretien/Notes sont avancés
> dans la Partie A actuelle (étape A7, une entité à la fois — voir `docs/roadmap.md`).
> Seuls **Dashboard** (Phase 6 — dépend des stats Matchs/Entraînement) et **Blessure**
> (Phase 8 — RGPD données de santé) restent différés. **Absence** est retiré de la Partie A :
> il sera traité avec le module Calendrier/présences (Partie B et/ou Phases 4-5), pas en
> Phase 6, l'emplacement précis restant à trancher au moment venu.

## Liste de l'effectif — filtres par poste

> **En cours (branche `feature/effectif-tableau-avance`)** : refonte vers un tableau unifié
> Joueurs + Staff — voir le plan associé. Prérequis déjà en place : nouvelle permission
> `roster_archive READ` (scope TEAM pour Coach, CLUB pour AdminClub, ALL pour
> SuperAdmin/Proprietaire — jamais Player) pour gater le filtre Actif/Archivé indépendamment
> du scope `player_team`/`team_staff` déjà partagé par Coach et Player ; `team_staff READ
> TEAM` étendu au rôle Player (absent jusqu'ici) pour qu'il puisse voir le staff dans le
> tableau unifié. B5 (frontend) en cours d'implémentation, par incréments (voir plus bas).
>
> **B1 — `GET /clubs/:clubId/teams/:teamId/roster` (implémenté)** : lecture unifiée
> `backend/src/roster/`. Fusionne `PlayerTeam` et `TeamStaff` en une forme commune
> (`RosterRow` : `id` de l'affectation sous-jacente, `memberId`, `playerId` — id du
> `PlayerProfile`, `null` pour une ligne staff, nécessaire au frontend pour rouvrir
> `PlayerFormDialog` en édition (B5) —, `role` — `"PLAYER"` ou `TeamStaffRole` —,
> `firstName`/`lastName`/`phone`/`email`/`gender`/`birthDate` du `Member`/`User` lié,
> `jerseyNumber`/`mainPosition`/`secondaryPositions`/`joinDate` pour les joueurs uniquement
> (`joinDate` toujours `null` pour le staff — n'existe pas sur `TeamStaff`), `isArchived`),
> triée/paginée en mémoire (volume par équipe trop faible pour justifier une
> jointure SQL unifiée). Query params : `status` (`ACTIVE` par défaut / `ARCHIVED` / `ALL`,
> vérifie `roster_archive READ` seulement si différent de `ACTIVE`), `position` (si présent,
> le staff — qui ne peut jamais y correspondre — est exclu du résultat plutôt que renvoyé
> puis filtré), `sortBy` (`jerseyNumber`/`lastName`/`phone`/`email`/`birthDate`/`role` — les
> valeurs nulles sont toujours reléguées en fin de liste, quel que soit le sens de tri),
> `sortOrder`, `page`, `pageSize` (20/50/100, défaut 20). Gardé par `player_team READ`
> (ressource principale) ; si l'appelant n'a pas `team_staff READ` (rôle personnalisé
> restreint), le staff est silencieusement omis plutôt que de renvoyer un 403 — un roster
> partiel plutôt qu'une erreur.
>
> **Indicateurs de capacité (B5)** : la réponse inclut aussi `canViewArchived`
> (`roster_archive READ`), `canCreate`/`canEdit` (`player_team CREATE`/`UPDATE`) et
> `canDelete` (`member DELETE`) — calculés via `PermissionsService`, jamais un nouvel
> endpoint "mes permissions". Le frontend n'a aucune infrastructure de permission côté
> client ; il se contente d'afficher/cacher le filtre Actif/Archivé et les boutons Créer/
> Éditer/Supprimer en masse selon ces booléens, la décision d'autorisation réelle restant
> entièrement backend (règle d'or, `docs/modules/auth-roles.md`).
>
> **B2 — action Archiver (implémentée)** : `PATCH .../players/:id/archive` sur
> `PlayerTeamsService.archive` (fixe `leaveDate`) et `PATCH .../staff/:id/archive` sur
> `TeamStaffService.archive` (fixe `endDate`) — deux endpoints minces qui délèguent
> entièrement à `update()` existant (corps optionnel `{ leaveDate }`/`{ endDate }`, défaut
> aujourd'hui si omis). Aucune permission nouvelle : réutilise `player_team UPDATE`/
> `team_staff UPDATE` déjà seedées, y compris `assertCanModifyPrincipal` côté staff (un
> Adjoint/Co-entraîneur ne peut pas archiver la fiche d'un *autre* Principal).
>
> **B3 — suppression RGPD en cascade (implémentée)** : `DELETE /clubs/:clubId/members/:id`
> sur `MembersController`/`MembersService.remove` (permission `member DELETE`, réservée
> AdminClub/SuperAdmin/Proprietaire — absente du Coach dans le seed, qui garde le droit
> d'archiver, pas de supprimer définitivement). Corps optionnel `{ forceAnonymize?: boolean }`.
> Ne supprime jamais le `User` lié (identifiants de connexion). Flux en deux temps pour un
> membre référencé comme auteur/évaluateur/référent (`PlayerNote.authorId`,
> `PlayerEvaluation.evaluatorId`, `PlayerInterview.staffId`, `PlayerAbsence.reportedById`,
> `PlayerObjective.assignedById`) sur des données d'**autres** joueurs (l'auto-référencement
> est exclu du comptage, il disparaît de toute façon avec le reste des données du membre) :
> - Par défaut, bloqué (409 `MEMBERS.REFERENCED_ELSEWHERE`, `details` = compteur par type +
>   total) — archiver est le chemin recommandé.
> - Avec `forceAnonymize: true`, ces références sont anonymisées (`authorId`/`evaluatorId`/...
>   mis à `null`, colonnes désormais nullables — voir `docs/schema/joueurs.md` §PlayerNote)
>   plutôt que de bloquer, puis la suppression se poursuit normalement.
>
> Une seule transaction Prisma supprime ensuite, dans l'ordre imposé par les contraintes FK,
> tout ce dont ce membre est le SUJET : `PlayerEvaluation` (cascade `PlayerEvaluationScore`),
> `PlayerMeasurement`, `PlayerNote`, `PlayerObjective`, `PlayerInterview`, `PlayerAbsence`,
> `PlayerTeam`, puis `TeamStaff`/`MemberRole`, puis `PlayerProfile`, puis `Member`.
>
> **B4 — création/édition en masse (implémentée, joueurs uniquement)** :
> `POST`/`PATCH /clubs/:clubId/teams/:teamId/roster/bulk` sur `RosterController`/
> `RosterService.bulkCreate`/`bulkUpdate`. Une seule transaction Prisma par requête,
> tout-ou-rien (décision produit) : `POST` crée `Member` + `PlayerProfile` + `PlayerTeam`
> pour chaque ligne (`CreateRosterRowDto` : identité + `jerseyNumber`/`mainPosition`/
> `secondaryPositions`/`joinDate`) ; `PATCH` cible un `PlayerTeam` existant par `id`
> (`UpdateRosterRowDto`, mêmes champs + `leaveDate`) et met à jour `Member`+`PlayerTeam`.
> L'unicité du numéro de maillot est vérifiée ligne par ligne **dans** la transaction : une
> insertion devient visible aux vérifications suivantes de la même transaction, ce qui
> détecte aussi bien un conflit avec une affectation déjà active qu'un doublon entre deux
> lignes du même envoi, sans logique dédiée aux doublons intra-lot. Scope volontairement
> limité aux joueurs (pas de bulk staff) — non demandé par le plan initial, à étendre si le
> besoin se confirme. Permission `player_team CREATE`/`UPDATE` déjà seedée TEAM (Coach) /
> CLUB/ALL (AdminClub/SuperAdmin/Proprietaire) — aucun changement de seed nécessaire.
>
> **B5.1/B5.2 — tableau unifié : lecture, tri, pagination, filtre statut (implémenté)** :
> `frontend/.../teams/[teamId]/players/page.tsx` consomme désormais `GET .../roster` au lieu
> de `GET .../players`. Nouveau composant réutilisable `components/ui/pagination.tsx`
> (`Pagination` + `PageSizeSelect`, tailles 20/50/100). Colonnes : N°, Nom, Prénom,
> Téléphone, Email, Date de naissance, Poste principal (badge), Postes secondaires (badges
> `variant="outline"`), Rôle (badge — nouvelle table de traduction `rosterRoles`,
> première apparition du staff dans le frontend). En-têtes triables (N°/Nom/Téléphone/Email/
> Date de naissance/Rôle) : un clic trie ascendant, un second clic sur la même colonne
> inverse le sens (icônes `lucide-react` `ArrowUp`/`ArrowDown`/`ArrowUpDown`). Filtre Statut
> (Actifs/Archivés/Tous) affiché seulement si `canViewArchived` ; bouton "Ajouter un joueur"
> affiché seulement si `canCreate` — aucune infrastructure de permission côté client,
> uniquement ces deux booléens transmis par le backend (voir "Indicateurs de capacité"
> ci-dessus). Changer un filtre/tri/taille de page remet toujours la pagination à la page 1.
> B5.4 (modales de création/édition en masse) implémenté, voir plus bas — le module Effectif
> (Partie B du plan) est désormais complet.
>
> **B5.3 — colonne Actions : Éditer/Archiver/Supprimer (implémenté)** :
> `components/players/roster-row-actions.tsx` (menu `dropdown-menu.tsx`), affiché seulement
> si `canEdit || canDelete` (colonne entière masquée sinon). "Éditer" diverge selon le rôle
> de la ligne :
> - **Joueur** : va chercher le détail complet via `GET /clubs/:clubId/players/:playerId`
>   (licenseNumber/nationality/preferredFoot/gender/joinDate, absents du `RosterRow` léger
>   de la liste), puis ouvre `PlayerFormDialog` existant pré-rempli. `PlayerFormDialog` a été
>   étendu (props `open`/`onOpenChange` optionnelles, `trigger` devenu optionnel) pour
>   supporter ce mode contrôlé sans trigger visible, en plus de son usage historique
>   self-managé (inchangé, entièrement rétrocompatible).
> - **Staff** : ouvre `staff-form-dialog.tsx` (nouveau, édition seulement — aucun bouton de
>   création de membre du staff, hors périmètre du plan). Ne couvre que les champs déjà
>   présents sur `RosterRow` (nom/prénom/téléphone/date de naissance/rôle) : aucun fetch
>   supplémentaire, contrairement au joueur. `gender` et `TeamStaff.startDate` restent hors
>   de ce formulaire (jamais envoyés dans les PATCH, donc jamais modifiés).
>
> "Archiver" (`archive-row-dialog.tsx`, confirmation simple) appelle le bon endpoint B2 selon
> le rôle (`.../players/:id/archive` ou `.../staff/:id/archive`). "Supprimer" (visible
> seulement si `canDelete`) ouvre `delete-member-dialog.tsx` : confirmation, puis sur 409
> `MEMBERS.REFERENCED_ELSEWHERE` bascule vers une seconde confirmation renforcée avant de
> renvoyer `forceAnonymize: true` (flux B3 complet).
>
> **Compromis délibéré** : pas de vérification côté client de la règle "un Adjoint/Co-
> entraîneur ne peut pas modifier la fiche d'un *autre* Principal" (`assertCanModifyPrincipal`)
> — `canEdit` reflète le scope UPDATE général, pas ce cas précis par ligne (nécessiterait de
> connaître le memberId ET le scope exact de l'appelant, non exposés aujourd'hui). Les boutons
> restent affichés ; le backend refuse (403) le cas échéant, affiché via un simple toast
> d'erreur plutôt qu'un masquage préventif — jamais un risque de sécurité, la règle d'or reste
> appliquée côté backend.
>
> **B5.4 — création/édition en masse, joueurs uniquement (implémenté)** : deux boutons
> ("Créer des joueurs en masse" / "Éditer des joueurs en masse") près de "Ajouter un joueur",
> gardés respectivement par `canCreate`/`canEdit`, ouvrant une modale pleine largeur
> (`bulk-create-players-dialog.tsx` / `bulk-edit-players-dialog.tsx`) avec un tableau éditable
> — lignes de saisie partagées via `bulk-player-row-fields.tsx` (identité, téléphone, genre,
> date de naissance, N°, poste principal, date d'arrivée ; un seul poste secondaire non
> proposé ici, même simplification que `PlayerFormDialog`). Chaque appel `POST`/`PATCH
> .../roster/bulk` (B4) envoie toutes les lignes en une fois, tout-ou-rien : une erreur
> transactionnelle (ex. conflit de numéro de maillot) laisse la modale ouverte et affiche un
> toast d'erreur global, jamais une erreur par ligne (la validation par ligne — champs requis
> — reste, elle, `zod` côté client, avant tout envoi réseau).
> - **Créer** : part d'une seule ligne vide, "Ajouter une ligne" en ajoute d'autres,
>   "Retirer cette ligne" en retire (désactivé s'il n'en reste qu'une).
> - **Éditer** : lignes FIGÉES, pré-remplies depuis le roster **actuellement affiché** (page
>   et filtres en cours — note explicite dans la modale), chacune ciblant un `PlayerTeam`
>   existant par son `id` cette fois non modifiable.
>
> Vérifié en live (création de deux lignes, édition en masse du nom d'une ligne, rollback
> complet + modale qui reste ouverte sur un conflit de maillot volontairement provoqué) en
> plus des tests unitaires.
>
> **Correctif 2026-07-10 — genre/date de naissance/date d'arrivée pas pré-remplis en édition
> (signalé par l'utilisateur)** : deux bugs distincts.
> 1. `gender`/`joinDate` étaient absents de `RosterRow` (B1) — déjà chargés côté backend
>    (`Member.gender`, `PlayerTeam.joinDate`), juste jamais mappés dans la réponse. Désormais
>    exposés, aucun coût réseau supplémentaire.
> 2. `birthDate`/`joinDate` ne se pré-remplissaient dans AUCUN `<input type="date">` du module
>    (`PlayerFormDialog`, `StaffFormDialog`, `bulk-edit-players-dialog.tsx`) dès que la valeur
>    contenait un composant horaire — l'API sérialise toujours une date en ISO complet
>    (`"2011-03-04T00:00:00.000Z"`), mais `<input type="date">` n'accepte que `"AAAA-MM-JJ"` et
>    rejette silencieusement toute autre valeur (champ vide, aucune erreur visible). Corrigé en
>    tronquant à `.slice(0, 10)` avant d'alimenter `defaultValues`/`toRowValues` — même
>    correctif déjà appliqué ailleurs dans le projet (`absence-form-dialog.tsx`,
>    `objective-form-dialog.tsx`, etc.), qui aurait dû être repris ici dès l'écriture initiale.

Tableau par équipe (voir le tableau unifié Joueurs + Staff plus haut pour les colonnes
actuelles). Deux filtres de poste combinables (en plus du filtre Statut) :
- **Par ligne** (Gardien/Défense/Milieu/Attaque) — la ligne n'est pas stockée en base, elle est
  dérivée du poste précis en code (voir `docs/schema/index.md` §enum `Position`). Sélectionner
  une ligne réduit les postes proposés dans le second filtre à ceux de cette ligne.
- **Par poste précis** (15 postes réels, voir `docs/schema/index.md`) — filtre sur
  `mainPosition` uniquement ; les postes secondaires sont affichés mais non filtrables.

### Rapprochement joueur — détection automatique Nouveau/Modification/Réactivation (révision 2026-07-16, remplace A18)

**Décisions du 2026-07-16** (`docs/decisions-ouvertes-et-rgpd.md`) : la création manuelle d'un
joueur (`PlayerFormDialog`) et l'import fichier (à venir) partagent le même service de
rapprochement backend plutôt que deux logiques distinctes. Remplace l'ancien sélecteur A18 à
deux boutons ("Joueur existant du club" / "Nouveau joueur") par une détection **automatique** et
**progressive**, en quatre étapes (retour utilisateur, corrige un flux initial trop permissif —
voir "Correctif" plus bas) :
1. Seuls prénom, nom, date de naissance et numéro de licence sont affichés — le reste du
   formulaire (téléphone, genre, nationalité, pied fort, affectation d'équipe) reste masqué.
2. Dès que prénom+nom **et** (date de naissance **ou** licence) sont renseignés, le frontend
   interroge `GET /clubs/:clubId/teams/:teamId/roster/lookup` (`RosterMatchingService.findMatches`,
   module `roster`), avec un léger débounce.
3. Une fois la recherche terminée, son résultat s'affiche dans une carte **quel que soit le
   statut** (traitement symétrique trouvé/non trouvé, retour utilisateur du 2026-07-16) :
   proposition de réactivation/liste ambiguë si une correspondance existe, ou "Aucune
   correspondance trouvée pour {Prénom} {Nom}" avec deux choix sinon — "Chercher à nouveau" (vide
   les quatre champs d'identité et attend une nouvelle recherche) ou "Créer un nouveau joueur"
   (garde les informations déjà saisies).
4. Le reste du formulaire (téléphone, genre, nationalité, pied fort, affectation d'équipe) n'est
   révélé **qu'une fois la décision prise** — jamais automatiquement, y compris pour un statut
   `NOUVEAU` (corrige une première version qui révélait déjà tout dès `NOUVEAU`, sans étape de
   confirmation, alors que `RÉACTIVATION`/`AMBIGU` en exigeaient une : traitement désormais
   symétrique). Si une correspondance est trouvée, les champs pertinents sont préremplis ; sinon
   ils restent vides. Le bouton "Rechercher un joueur existant" (repli manuel, voir plus bas)
   suit une règle de visibilité distincte, indépendante de cette décision.

**Correctif (signalé le 2026-07-16, jour du déploiement)** : la première version révélait tout le
formulaire dès l'ouverture et lançait la recherche dès prénom+nom seuls renseignés — un joueur
archivé retrouvé uniquement par nom+date de naissance restait invisible tant que la date de
naissance n'était pas saisie (ex. "Nina David", archivée en U15, non détectée en tentant de
l'ajouter en U11 avec prénom+nom seuls). Le backend répondait honnêtement `NOUVEAU` (rien
d'assez fiable à chercher sans date de naissance ni licence, voir cascade ci-dessous), mais rien
dans l'interface n'expliquait pourquoi. Corrigé en n'autorisant le déclenchement de la recherche
que si prénom+nom **et** (date de naissance **ou** licence) sont réunis, et en masquant le reste
du formulaire tant que ce n'est pas le cas — élimine la possibilité même d'une recherche
insuffisante plutôt que d'ajouter un message d'avertissement après coup.

**Ambiguïté résiduelle signalée par l'utilisateur** : même après ce correctif, rien n'indiquait
visuellement qu'au-delà de prénom+nom, continuer à remplir date de naissance/licence déclenche une
vérification automatique — seul le bouton "Rechercher un joueur existant" (recherche manuelle) est
visible dès le départ, laissant croire à tort que c'est la seule option. Un texte d'aide discret
(`text-xs text-muted-foreground`) a été ajouté juste sous les champs date de naissance/licence,
expliquant le mécanisme — visible uniquement tant qu'aucune recherche automatique n'a encore été
tentée (`!hasSearched`), le panneau de résultat prenant ensuite le relais pour communiquer l'état.

**Erreur de soumission liée à un champ précis — affichage inline en plus du toast** : jusqu'ici,
toute erreur de soumission (ex. `PLAYER_TEAMS.JERSEY_NUMBER_TAKEN`) n'était signalée que par un
toast (`sonner`), peu visible en bas de l'écran (retour utilisateur). Pour le numéro de maillot
précisément, l'erreur est désormais **aussi** posée sur le champ lui-même via `setError` de
`react-hook-form` (`aria-invalid` + message dédié sous le champ, même convention visuelle que les
erreurs de validation zod existantes — prénom/nom requis) — le toast reste affiché en parallèle,
pas remplacé. Pattern réutilisable pour tout futur code d'erreur rattachable à un champ précis du
formulaire.

**Cascade de rapprochement, intra-club uniquement pour l'instant** : licence exacte (parmi tous
les `Member` du club, actifs ou non — voir `docs/schema/joueurs.md` §PlayerProfile), puis repli
nom+prénom+date de naissance si la licence est absente ou ne matche rien. **L'email est
volontairement exclu** de cette cascade : la réactivation inter-club (retrouver un compte `User`
existant d'un autre club) est un mécanisme séparé, non encore implémenté, voir décision ouverte
#7. Sans repli fiable, un membre sans compte transférant d'un autre club remonte donc comme
`NOUVEAU`, jamais comme `RÉACTIVATION` — limite acceptée.

**Quatre statuts possibles** :
- **`NOUVEAU`** : aucune correspondance — le formulaire complet (identité + affectation) reste
  affiché normalement.
- **`MODIFICATION`** : une correspondance a une affectation `PlayerTeam` **déjà active dans
  cette équipe précise** — simple notice ("Ce joueur est déjà dans cette équipe"), validation
  bloquée (pas d'action pertinente dans ce flux de création).
- **`RÉACTIVATION`** : une correspondance existe mais n'est pas active dans cette équipe précise
  — recouvre deux cas distincts côté backend (jamais différenciés dans l'UI, un seul badge) :
  retour dans cette même équipe après un départ, ou actif/archivé dans **une autre équipe du
  club**. Dans les deux cas, le backend renvoie `lastAssignment` — la dernière affectation
  connue de ce candidat, **toutes équipes confondues** (pas seulement l'équipe ciblée) — utilisée
  pour **préremplir** numéro de maillot et poste, modifiables avant validation. Correctif du
  2026-07-16 (signalé par l'utilisateur, cas "Nina David" archivée en U15 puis recherchée pour
  U11) : la première version ne préremplissait que depuis un retour dans la même équipe, laissant
  les champs vides dès que la dernière affectation venait d'une équipe différente — un point de
  départ modifiable (même approximatif) a été jugé préférable à un champ vide. Deux actions :
  "Réactiver ce joueur" (réutilise le `PlayerProfile` existant, POST unique
  `/clubs/:clubId/teams/:teamId/players` avec le `playerId` trouvé — aucun `Member`/`PlayerProfile`
  recréé) ou "Non, créer un nouveau joueur" (ignore la suggestion, force le flux `NOUVEAU`).
- **`AMBIGU`** : plusieurs candidats trouvés sur le repli nom+date de naissance (cas rare) —
  liste de candidats à choisir, ou "Aucun ne correspond, créer un nouveau joueur".

**Recherche manuelle de secours — un bouton, pas un lien** (retour utilisateur du 2026-07-16) :
"Rechercher un joueur existant" rouvre l'ancienne recherche libre par nom (A16, `GET
/clubs/:clubId/players?search=...`, sans date de naissance ni licence requises), pour les cas où
la détection automatique ne trouve rien ou se trompe (homonyme mal orthographié, faute de frappe
sur la licence) — mais aussi et surtout pour le cas où **ni la date de naissance ni le numéro de
licence ne sont connus au moment de la saisie**, ce qui empêche toute recherche automatique de se
déclencher (elle exige l'un des deux, voir cascade ci-dessus). Ce bouton n'est donc jamais
obsolète malgré "Chercher à nouveau" (qui ne fait que réinitialiser la même cascade exacte) :
c'est le seul chemin qui fonctionne par nom seul. **Visible dès que prénom+nom sont renseignés**,
indépendamment de l'état de la recherche automatique (en cours, résolue ou jamais déclenchée) —
initialement asservi à la même recherche automatique (donc inaccessible sans date de
naissance/licence, exactement le cas où il est le plus utile), corrigé pour être détaché de cette
condition. Un candidat choisi ici suit exactement le même chemin de soumission qu'une réactivation
automatique confirmée.

**Faille de permission réelle trouvée et corrigée le 2026-07-16 (signalée par l'utilisateur : "Nina"
introuvable alors qu'elle existe bel et bien dans le club)** : `GET /clubs/:clubId/players`
(`PlayersController.findAll`, A16) ne porte aucun `teamId` dans son URL naturelle — exactement le
premier cas documenté en tête de §"Patterns découverts" (`docs/modules/auth-roles.md`) : un scope
`TEAM` ne peut jamais matcher une route sans `teamId`. Un Coach (`player_profile READ` scopé
`TEAM` dans le seed) recevait donc systématiquement un **403**, jamais un tableau vide — confirmé
en conditions réelles (`curl` avec un compte de dev, `eva.vincent@fc-les-ormes...`, Coach principal
de l'U11 du club "FC Les Ormes") : 403 sans `?teamId=`, 200 avec. Cette faille existait déjà avant
la présente révision (héritée telle quelle du sélecteur A18 d'origine, jamais remarquée car les
tests frontend mockent `apiFetch` et n'exercent jamais le vrai `PermissionsGuard`) — elle rendait
la recherche manuelle **totalement inutilisable par un Coach**, le rôle qui en a le plus besoin au
quotidien.

Deux corrections, dans `player-form-dialog.tsx` :
- La requête transmet désormais `&teamId=${teamId}` (le composant le connaît déjà en prop) —
  satisfait uniquement la résolution du *scope* du guard, ne restreint jamais les résultats
  eux-mêmes à cette équipe (`PlayersService.findAllByClub` ne filtre par `teamId` pour aucun scope
  TEAM/CLUB/ALL) : la recherche reste bien club-wide, toutes équipes confondues.
- Le bloc `catch` confondait silencieusement **toute** erreur (réseau, permission...) avec "aucun
  résultat" (`searchResults([])`) — c'est précisément ce qui a caché ce bug. Une erreur affiche
  désormais un toast (code d'erreur traduit, jamais de texte brut — §6 `typescript-conventions.md`)
  et laisse `searchResults` à `null` (distinct d'un tableau vide), plutôt que de se faire passer
  pour un résultat de recherche légitime.

**Faille de permission trouvée et corrigée en construisant `GET .../roster/lookup`** :
`PermissionsGuard` ne vérifie que "ce membre a-t-il *un* scope quelconque sur `player_profile
READ` ?" — un Player (scope `OWN`) ou un Parent (scope `PARENT`) en dispose légitimement pour
d'autres routes, et passerait donc le guard sur cette route (elle porte `teamId` dans son URL,
contrairement à `GET /players`/`GET /players/:id` qui les rejettent faute de `teamId`). Rejet
explicite ajouté dans `RosterMatchingService` pour ces deux scopes : cet outil de rapprochement
est réservé au staff (Coach/AdminClub/SuperAdmin/Proprietaire), un Player/Parent n'a aucun cas
d'usage légitime pour rechercher un joueur quelconque du club par nom/licence.

**Aucune fermeture automatique de l'ancienne affectation** : réactiver un joueur déjà actif dans
une autre équipe (ex. promotion U15 → U16) ne clôt jamais son ancienne `PlayerTeam` — ce serait
d'ailleurs impossible à autoriser proprement (le Coach de la nouvelle équipe n'a aucun droit
d'écriture sur l'ancienne équipe, règle d'or des permissions). Archiver l'ancienne affectation
reste un geste séparé et volontaire, laissé au Coach de l'équipe quittée (action "Archiver" déjà
existante, B2). Un joueur peut donc, temporairement ou durablement, avoir plusieurs affectations
`PlayerTeam` actives simultanément sur des équipes différentes du même club — cas non empêché par
le backend (`PlayerTeamsService.create` ne bloque qu'un doublon sur la **même** équipe),
volontairement laissé à l'appréciation des Coachs.

**Date d'arrivée dans l'équipe — préremplie à aujourd'hui, toujours modifiable** (retour
utilisateur du 2026-07-16) : en création (nouveau joueur ou réactivation), `joinDate` est
préremplie à la date du jour plutôt que laissée vide — modifiable librement pour anticiper une
arrivée future ou rattraper un retard de saisie. Ne s'applique qu'à la création : en édition,
une date d'arrivée déjà vide n'est jamais réécrite avec la date du jour.

> **B5.5 — création de staff + attribution du rôle Coach (backend implémenté, frontend à venir,
> branche `feature/effectif-staff-roles-fixes`)** : constat en usage réel (2026-07-16) —
> `POST .../teams/:teamId/staff` existait déjà mais ne créait jamais le `MemberRole` Coach
> correspondant, et aucune interface ne permettait de toute façon d'atteindre cet endpoint
> (`StaffFormDialog` est édition seulement). Un membre du staff ajouté restait donc sans
> aucune permission tant qu'un développeur n'insérait pas la ligne `MemberRole` manuellement en
> base — exactement le trou constaté avec le club réel de l'utilisateur. `TeamStaffService`
> réécrit pour créer/révoquer `TeamStaff` ET `MemberRole` (rôle système `Coach`, scopé
> `clubId`+`teamId`) ensemble, dans une même transaction, aux trois endpoints existants :
> - **`create`** : crée les deux à la fois (une affectation TeamStaff sans son MemberRole,
>   ou l'inverse, ne devrait plus jamais se produire pour une affectation créée après ce
>   correctif).
> - **`update`/`archive`** et **`remove`** : si l'affectation passe d'active à terminée
>   (`endDate` transmis alors qu'elle était `null`, ou suppression), le `MemberRole` Coach actif
>   correspondant est révoqué (son `endDate` est fixé — jamais supprimé, cohérent avec
>   `isDateRangeActive`/`PermissionsService`, qui traite déjà `MemberRole.endDate` comme la
>   fenêtre d'activité). Silencieux si aucun `MemberRole` actif n'est trouvé (affectation créée
>   avant ce correctif, ex. le patch manuel appliqué pour l'utilisateur) — la révocation ne doit
>   jamais faire échouer l'action principale sur `TeamStaff`.
>
> **Deux règles métier nouvelles, non exprimables dans le système de permission générique**
> (même rôle/scope, seule la valeur/ligne cible diffère — même limitation que
> `assertCanModifyPrincipal`, préexistant) — décision produit du 2026-07-16 :
> - **Créer une affectation de staff** (n'importe quel `staffRole`) est réservé, en scope
>   `TEAM`, au **Principal en poste sur cette équipe** — un Co-entraîneur/Adjoint ne peut pas
>   ajouter de staff, même si `team_staff CREATE` (scopé `TEAM`) leur est accordé génériquement
>   par le rôle `Coach` dans le seed. Un scope `CLUB`/`ALL` (AdminClub/SuperAdmin/Proprietaire)
>   n'est jamais concerné par cette restriction (`TEAM_STAFF.ONLY_PRINCIPAL_CAN_CREATE`).
> - **Assigner le rôle `PRINCIPAL`** — à la création, ou par promotion via `update` (un
>   Co-entraîneur/Adjoint existant dont le `staffRole` cible devient `PRINCIPAL`) — est réservé
>   au scope `CLUB`/`ALL` : même le Principal en poste ne peut ni se remplacer, ni désigner un
>   co-Principal, ni promouvoir qui que ce soit à ce rang (`TEAM_STAFF.ONLY_ADMIN_CAN_ASSIGN_PRINCIPAL`).
>   Ne se déclenche pas quand le `staffRole` cible est déjà `PRINCIPAL` avant l'appel (auto-
>   édition sans changement de rôle, ex. le Principal modifie ses propres dates — cas déjà permis
>   par `assertCanModifyPrincipal`).
>
> Le frontend (nouveau bouton "Ajouter un membre du staff" sur le tableau Effectif, création
> d'un nouveau membre uniquement pour cette première version — pas de rapprochement avec un
> membre existant, à la différence du flux joueur) reste à construire.

## Import fichier (Excel/CSV) (branche `feature/effectif-import-fichier`)

> Réutilise le service de rapprochement (`RosterMatchingService`, ci-dessus) par ligne plutôt
> qu'une logique de matching séparée. Découpage en six incréments, tous implémentés :
> 1. Upload + extraction brute des en-têtes/lignes.
> 2. Mapping des colonnes (frontend).
> 3. Envoi au backend, rapprochement par ligne.
> 4. Tableau de prévisualisation avec décision par ligne (frontend).
> 5. Validation, transaction tout-ou-rien.
> 6. Rechargement du tableau Effectif existant (frontend).

**Étape 1 — `POST /clubs/:clubId/teams/:teamId/roster/import/parse`** (`RosterImportService`,
module `roster`) : upload multipart (`FileInterceptor`), aucune écriture en base. Un seul format
de fichier accepté par extension (`.csv` ou `.xlsx`, jamais déduit du mime-type — trop
inconsistant selon les navigateurs). Limites volontairement basses (bornent la taille de la
transaction de l'étape 5, un import de club restant de l'ordre de quelques dizaines à quelques
centaines de lignes) : 2 Mo, 500 lignes de données maximum (hors en-tête). Renvoie les en-têtes et
les lignes à l'état brut (toutes les valeurs converties en chaîne, dates au format AAAA-MM-JJ en
date locale) — aucune interprétation métier ici, le mapping colonne → champ étant une décision de
l'utilisateur (étape 2, frontend). Gardé par `player_team CREATE` (même ressource que
l'aboutissement de l'import) — exclut donc déjà Player/Parent par construction, contrairement à
`lookup` qui avait dû ajouter un rejet explicite côté service (voir plus haut).

**Dépendance ajoutée : `exceljs`** (lecture XLSX et CSV avec une seule bibliothèque — CSV via
`workbook.csv.read()`, une fonctionnalité déjà intégrée, pas une bibliothèque séparée). `uuid`
(dépendance transitive d'exceljs) forcé à `^11.1.1` via `overrides` dans `package.json` : la
version historiquement tirée par exceljs a une vulnérabilité modérée corrigible sans changement
cassant. **Défaut de types connu d'exceljs** : son fichier `index.d.ts` déclare son propre
`Buffer` ambiant minimal (`declare interface Buffer extends ArrayBuffer {}`), qui se fusionne avec
le vrai `Buffer` de `@types/node` dès que le paquet est importé et rend tout `Buffer` Node.js réel
structurellement incompatible avec le paramètre attendu par `.load()` — aucun cast direct ne
peut satisfaire les deux définitions à la fois. Contourné par un `any` documenté (dernier recours,
`docs/typescript-conventions.md` §3), isolé à cette seule ligne.

**Étape 3 — `POST .../roster/import/preview`** : reçoit les lignes déjà mappées par l'utilisateur
(`ImportRowInputDto`, étend `CreateRosterRowDto` de B4 — jamais modifié — avec
`licenseNumber`/`nationality`/`preferredFoot`, absents du bulk manuel). Vérifie le scope de
l'appelant et l'appartenance de l'équipe au club **une seule fois**, puis rapproche chaque ligne
via `RosterMatchingService.findMatchesForRow` — nouvelle méthode extraite de `findMatches` (utilisée
par `lookup`) pour ne pas répéter cette vérification à chaque ligne d'un import de plusieurs
centaines. Renvoie `{ index, status, candidates }` par ligne, aucune écriture.

**Étape 5 — `POST .../roster/import/commit`** (backend complet) : applique les décisions déjà
prises par l'utilisateur à l'écran de prévisualisation — ne rejoue jamais la cascade de
rapprochement, la décision de l'utilisateur fait foi. Une seule transaction, tout-ou-rien (même
convention que `bulkCreate`/`bulkUpdate`, B4). Trois actions par ligne (`ImportRowDecisionDto`) :
- **`CREATE`** : nouveau Member + PlayerProfile + PlayerTeam — comme `bulkCreate`, avec en plus
  `licenseNumber`/`nationality`/`preferredFoot` sur le `PlayerProfile`.
- **`UPDATE`** (statut `MODIFICATION` — le seul cas où l'import diffère du formulaire unitaire,
  qui bloque ce statut faute d'action pertinente dans un flux de création pure) : met à jour
  Member + PlayerProfile + PlayerTeam existants avec les valeurs de la ligne — c'est le seul cas de
  l'import qui réécrit l'identité d'un profil déjà présent en base.
- **`REACTIVATE`** (statut `RÉACTIVATION` accepté, ou candidat choisi sur `AMBIGU`) : réutilise le
  `PlayerProfile` existant, crée uniquement une nouvelle affectation `PlayerTeam` — **jamais** de
  mise à jour du Member/PlayerProfile, même convention que la réactivation dans `PlayerFormDialog`
  (les champs d'identité de la ligne sont ignorés, seuls les champs d'équipe s'appliquent).

Réutilise les vérifications déjà établies, réécrites pour opérer sur le client de transaction :
unicité du maillot parmi les affectations actives (`ROSTER.JERSEY_NUMBER_TAKEN`), unicité de la
licence scopée au club (`PLAYERS.LICENSE_NUMBER_ALREADY_USED_IN_CLUB`, décision du 2026-07-16), et
`PLAYER_TEAMS.ALREADY_ACTIVE` pour `REACTIVATE` si une affectation active existe déjà (garde-fou,
ne devrait pas arriver si le statut `MODIFICATION` a été correctement résolu à l'étape 3).

**Étapes 2/4/6 — `ImportPlayersDialog`** (frontend, `components/players/import-players-dialog.tsx`) :
assistant en trois étapes (upload → mapping → prévisualisation), déclenché depuis le tableau
Effectif (bouton "Importer un fichier", gardé par `capabilities.canCreate` — même convention que
les autres actions d'écriture du tableau).
- **Mapping (étape 2)** : un `<Select>` par colonne détectée, associant à un champ cible ou
  "Ignorer cette colonne". Pré-remplissage heuristique best-effort (alias de noms de colonnes
  courants, FR/EN, jamais affiché à l'utilisateur — seulement une aide au clic, jamais bloquant) ;
  l'utilisateur confirme ou corrige toujours manuellement. Un champ ne peut être associé qu'à une
  seule colonne à la fois : en choisir un déjà pris ailleurs remet l'ancienne colonne à "Ignorer"
  plutôt que de bloquer avec une erreur de validation. Prénom/nom doivent être mappés pour
  continuer.
- **Conversion valeur brute → champ typé** : les enums (genre, poste, pied fort) sont reconnus à la
  fois sous leur code brut (ex. `CB`) et sous leur libellé traduit (ex. "Défenseur central") — la
  correspondance est construite dynamiquement à partir des traductions déjà existantes
  (`gender`/`positions`/`foot`), sans dupliquer de dictionnaire d'alias par langue. Une valeur non
  reconnue est simplement ignorée (champ laissé vide) plutôt que de faire échouer toute la ligne.
  Les dates acceptent le format ISO (`AAAA-MM-JJ`, déjà produit par l'étape 1 pour les cellules
  Excel) et le format `JJ/MM/AAAA`. Les lignes entièrement vides sont ignorées silencieusement (avec
  un décompte affiché) ; une ligne sans prénom ou nom après mapping est ignorée avec un avertissement
  distinct — ni l'une ni l'autre ne bloque l'import des lignes valides.
- **Prévisualisation (étape 4)** : une ligne par résultat de `RosterMatchingService`, avec une
  case "Inclure" (cochée par défaut) et une décision selon le statut — `NOUVEAU` s'inclut tel quel,
  `MODIFICATION` affiche une notice (mise à jour automatique, pas de choix), `RÉACTIVATION` propose
  une case à cocher (réactiver par défaut, décocher = créer un nouveau joueur à la place), `AMBIGU`
  impose un choix explicite parmi les candidats (ou "aucun ne correspond") — le bouton de
  validation reste désactivé tant qu'une ligne `AMBIGU` incluse n'a pas de choix résolu.
- **Validation (étape 6)** : construit un `ImportRowDecisionDto[]` à partir des décisions
  résolues (lignes exclues omises), `POST .../roster/import/commit`, puis referme la modale et
  recharge le tableau Effectif (`onSuccess`/`loadRoster`, même convention que les autres modales
  d'écriture du tableau).

## Profil joueur — mise en page 2 colonnes

La fiche joueur est structurée en deux colonnes :
- **Colonne de gauche (fixe, toujours visible)** : panneau d'informations statiques —
  identité (nom, avatar/initiales, rôle, email si compte, téléphone, date de naissance, genre) +
  informations sportives (statut actif/inactif, date d'arrivée dans l'équipe, numéro de licence,
  pied fort, numéro de maillot) + un **sélecteur de poste visuel** (terrain interactif, voir
  ci-dessous). Alimenté par `Member` + `PlayerProfile` + l'affectation `PlayerTeam` active —
  toutes ces entités existent déjà, donc ce panneau est fonctionnel dès sa construction.
- **Colonne de droite (zone principale)** : barre à 8 onglets (`Notes` ajouté au découpage
  initial de 7 — décision du 2026-07-06), chacun fonctionnel dès la phase indiquée dans le
  tableau ci-dessous.

### Sélecteur de poste — terrain interactif

Le poste (principal et secondaires) se choisit par clic sur une représentation visuelle du
terrain (inspirée de Football Manager), pas via un menu déroulant, dans la carte "Positions" de
la fiche joueur :
- Deux onglets **Principal** / **Autres** au-dessus du terrain déterminent ce que fait un clic :
  en mode Principal, cliquer sur un poste le définit comme poste principal (sélection unique —
  cliquer à nouveau sur le poste déjà principal le désélectionne) ; en mode Autres, cliquer
  bascule ce poste dans/hors des postes secondaires (sélection multiple). Un poste déjà principal
  est désactivé dans l'onglet Autres pour éviter une confusion (pas de doublon principal/secondaire).
- Code couleur : poste principal en bleu, postes secondaires en orange, postes non sélectionnés en
  gris — cohérent avec les badges affichés sous le terrain.
- **Sauvegarde immédiate** : chaque clic déclenche un `PATCH` sur l'affectation `PlayerTeam`
  concernée (pas de bouton "Enregistrer" séparé) ; en cas d'échec réseau, la sélection est
  restaurée à son état précédent et une erreur est affichée.
- Le formulaire d'ajout/édition (`PlayerFormDialog`, effectif équipe) garde pour l'instant de
  simples menus déroulants pour le poste principal — un seul poste secondaire y est éditable
  (le premier élément du tableau) ; le terrain interactif n'y est pas encore utilisé (décision du
  2026-07-06, à revoir si besoin).

## Profil joueur — onglets

| Onglet | Contenu | Entité(s) associée(s) | Phase |
|---|---|---|---|
| **Mesures** | courbes d'évolution (taille, poids...) | `PlayerMeasurement` | Phase 2, étape A7.1 |
| **Entretien** | comptes-rendus d'entretiens individuels | `PlayerInterview` | Phase 2, étape A7.2 |
| **Notes** | notes du staff sur le joueur, visibilité Privé/Semi-privé/Public | `PlayerNote` | Phase 2, étape A7.3 |
| **Objectifs** | objectifs de développement, 4 statuts | `PlayerObjective` | Phase 2, étape A7.4 |
| **Évaluation** | session multi-critères, radar dynamique (N catégories selon la config du club) | `EvaluationCriterion` + `PlayerEvaluation` + `PlayerEvaluationScore` | Phase 2, étape A7.5 |
| **Dashboard** | vue d'ensemble (stats clés, dernières évaluations, objectifs en cours) | agrégation | Phase 6 — dépend des stats Matchs (Phase 4) et Entraînement (Phase 5) |
| **Absence** | absences planifiées, motif en liste fermée + description libre | `PlayerAbsence` | Construit à l'étape B8 du module Calendrier (`docs/modules/calendrier-evenements.md` §Absences) |
| **Blessure** | suivi médical | `Injury` — voir `docs/modules/blessures.md` | Phase 8 (données de santé, RGPD dédié) |

### Boutons d'action masqués pour un joueur consultant sa propre fiche (correctif post-B9, 2026-07-09)

Jusqu'ici, aucun onglet ne masquait ses boutons d'ajout/édition/suppression selon le rôle du
viewer — l'autorisation reposait entièrement sur le backend (403 au clic), sans retour visuel
préalable. Un Player consultant sa propre fiche (seul cas où un Player peut charger cette page :
`PlayersService.findOne` refuse tout profil qui n'est pas le sien en scope `OWN`) voyait donc des
boutons "Ajouter une mesure", "Ajouter une évaluation", "Modifier", "Supprimer"... qu'il n'avait
jamais le droit d'utiliser.

**Solution retenue** : `isOwnProfile` (page.tsx, `player.member.user.id === utilisateur
connecté`, `!!` des deux côtés pour éviter qu'un id manquant des deux côtés ne soit faussement
traité comme "même personne") est propagé à chaque onglet (`MeasurementsTab`, `InterviewsTab`,
`NotesTab`, `ObjectivesTab`, `EvaluationTab`, `AbsenceTab`) et au bouton "Modifier" du profil
joueur en haut de page. Chaque onglet masque son formulaire d'ajout et les actions
édition/suppression par ligne quand `isOwnProfile` est vrai — reflète exactement les permissions
réelles du rôle Player dans `backend/prisma/seed.ts` (READ/OWN seul sur toutes ces ressources,
sauf `player_absence` qui a aussi CREATE/OWN, déjà traité différemment dans `AbsenceTab`).
**Simplification documentée** : suppose qu'un Player n'est jamais *aussi* Coach/AdminClub sur le
contexte de cette page précise (cas non exclu par le système de rôles multiples, mais non
représenté dans les données de démo) — un tel double-rôle verrait ses boutons masqués à tort sur
sa propre fiche joueur. À revisiter si ce cas se présente réellement (remplacerait le raccourci
identité par une vérification de permission explicite par ressource).

### Mesures — filtres/tri toujours résolus côté backend

**Décision du 2026-07-06** : dans tout le projet, un filtre ou un tri affiché à l'écran doit,
dans la mesure du possible, être résolu côté backend (query params sur le `GET`), jamais par un
`.filter()`/`.sort()` en mémoire sur des données déjà chargées. L'onglet Mesures est le premier
à appliquer cette règle et sert de référence pour les prochains onglets/modules :

- **Filtres partagés** (carte du haut, décision du 2026-07-06) : **type** (Taille/Poids/Tous
  les types) + plage de dates (`Du`/`Au` — une date unique s'obtient en renseignant la même
  date aux deux champs). Un seul jeu d'état pour le graphique ET le tableau : changer un filtre
  redéclenche les deux appels `GET .../measurements?type=...&dateFrom=...&dateTo=...` en
  parallèle (deux appels réseau car le tri du tableau — voir plus bas — ne s'applique pas au
  graphique, toujours chronologique ; mais le filtre est identique pour les deux). Le filtre par
  saison/championnat viendra se greffer sur les mêmes query params une fois la Phase 3 en place
  (voir note plus haut) — non implémenté pour l'instant, pas de contrôle d'UI présent en
  attendant.
- **Graphique unique** : les deux courbes (Taille, Poids) sont superposées sur un même
  graphique (`recharts`/`LineChart`), fusionnées par date. Couleurs validées via la skill
  dataviz (contraste + séparation CVD, ΔE ≈ 100) plutôt que les variables `--chart-1`/`--chart-2`
  du thème (trop proches, peu visibles) — bleu `#2a78d6`/`#3987e5` et orange `#eb6834`/`#d95926`
  (clair/sombre), cohérent avec le code couleur déjà utilisé pour le sélecteur de poste. Une
  légende cliquable personnalisée (pas le composant `ChartLegendContent` de shadcn, qui n'est pas
  interactif) pilote directement le filtre `type` partagé (décision du 2026-07-06) — cliquer une
  série l'isole (l'autre est estompée, opacité 0.4) et redéclenche les deux fetchs backend
  (graphique + tableau) avec `type=HEIGHT`/`WEIGHT` ; cliquer la série déjà isolée revient à
  "Tous les types". Ce n'est donc plus un masquage purement visuel côté client : la légende est
  une troisième façon d'agir sur le même filtre backend que le sélecteur "Type" et le tableau.
  `Line` reste monté (prop `hide` dérivée du filtre) pour que son entrée de légende reste
  cliquable même quand ses données sont actuellement absentes.
- **Ligne d'ajout** : formulaire compact sur une seule ligne (type, valeur, date, bouton), sans
  carte/titre dédié.
- **Tableau d'historique** : mêmes filtres que le graphique (carte du haut, pas de filtres
  propres) + tri par colonne (`Date`/`Valeur`, cliquer l'en-tête bascule asc/desc), résolu par
  les query params `sortBy`/`sortOrder` côté backend — propres au tableau, le graphique reste
  toujours chronologique. Bouton Supprimer en `variant="destructive"` (rouge) pour signaler une
  action irréversible.
- **Bug — graphique écrasé quand le formulaire d'ajout est masqué (correctif post-B9,
  2026-07-09)** : la carte du graphique (`h-full`) est étirée (`items-stretch`) à la hauteur de
  la colonne de gauche (Filtres + Formulaire) — masquer le formulaire pour un joueur consultant
  sa propre fiche (`isOwnProfile`) raccourcissait cette colonne, écrasant le graphique avec elle
  (illisible : courbes tassées, peu d'espace vertical). Corrigé par `min-h-96` sur la carte du
  graphique, indépendant de la présence du formulaire.
- **Bugs #2 — retour immédiat sur le correctif ci-dessus (2026-07-09)** : les deux champs de la
  plage de dates (`w-36` fixes) débordaient de la carte Filtres (20rem de large, insuffisant pour
  deux champs de 9rem + séparateur) — corrigé en `w-0 min-w-0 flex-1` comme le fait déjà l'onglet
  Évaluation (même layout à deux colonnes), qui n'avait pas cette incohérence. Carte Filtres
  étirée (`flex-1`) jusqu'au bas de la colonne **seulement quand le formulaire est masqué** —
  évite un grand vide sous elle une fois `min-h-96` appliqué au graphique ; dimensions inchangées
  quand le formulaire est affiché (comportement historique).
- **Bugs #3 — le passage en `flex-1` casse le passage à la ligne Type/Date (2026-07-09)** : avec
  des champs `flex-1` (largeur flexible), `flex flex-wrap` ne déclenche plus de retour à la ligne
  entre les blocs Type et Date — ils se réduisaient à une largeur illisible sur une même ligne
  plutôt que de passer à la ligne (le retour à la ligne d'un flex-wrap ne se déclenche que pour
  des éléments à largeur fixe/naturelle, pas des `flex-1` qui se contentent de rétrécir). Corrigé
  en empilant Type et Date verticalement dans la carte Filtres (`flex flex-col gap-3`, chaque
  bloc sur 100% de la largeur), plutôt qu'un flex-wrap horizontal — pertinent uniquement pour
  cette carte étroite (colonne de 20rem partagée avec le graphique), pas pour les barres de
  filtres pleine largeur des autres onglets (Notes/Objectifs/Entretien/Absence), qui gardent leur
  flex-wrap horizontal existant.

### Entretien — timeline, staffId auto-assigné, planification à l'avance

- **Présentation en timeline** (pas un tableau) : chaque entretien est une carte reliée par une
  ligne verticale, triée par date (tri backend `sortOrder`, décroissant par défaut — plus récent
  en haut). Chaque carte affiche la date, le sujet en titre (avec un badge **Planifié** si la date
  est future), le résumé, puis — chacun dans son propre bloc, uniquement s'il est renseigné —
  le retour de l'encadrant, le retour du joueur et l'évaluation interne (bordure en pointillés +
  icône cadenas), et enfin le nom du membre du staff qui a conduit l'entretien.
- **Planifier un entretien à l'avance, le compléter après coup** (décision du 2026-07-06) : seuls
  date/sujet/résumé sont requis à la création — on peut créer un entretien pour une date future en
  ne renseignant que ce qu'on prévoit d'aborder. `staffFeedback`/`staffAssessment`/`playerFeedback`
  sont tous les trois optionnels, à la création comme à l'édition, pour être remplis une fois
  l'entretien passé.
- **Trois champs de retour, deux niveaux de visibilité** :
  - `staffFeedback` ("Retour de l'encadrant") — conclusions retenues avec le joueur.
  - `playerFeedback` ("Retour du joueur") — ce que le joueur a exprimé, résumé par le staff.
  - `staffAssessment` ("Évaluation interne de l'encadrant") — ressenti/évaluation interne, jamais
    communiqué au joueur.

  Les deux premiers sont **visibles par le joueur concerné** ; `staffAssessment` ne l'est **jamais** —
  même tension RGPD Article 15 que les notes `PRIVE` de `PlayerNote` (voir
  `docs/decisions-ouvertes-et-rgpd.md`). Le frontend ne fait aucune vérification de rôle pour
  décider quoi afficher : c'est le backend qui omet purement et simplement `staffAssessment` de la
  réponse JSON pour un appelant en scope `OWN` (`PlayerInterviewsService.findAllByPlayer`) — la
  présence/absence de la clé dans la réponse pilote le rendu, comme partout ailleurs dans
  l'application.
- **Un Player ne voit jamais les entretiens à venir** : `findAllByPlayer` plafonne la borne haute
  de la plage de dates à la fin de la journée courante pour un appelant en scope `OWN`, quelle que
  soit la valeur de `dateTo` transmise en query. Un Coach/AdminClub voit l'intégralité (passé et
  futur), y compris ceux qui ne sont pas encore complétés.
- **Filtres backend** (même règle que Mesures, décision du 2026-07-06) : plage de dates
  (`Du`/`Au`) + tri (`Plus récent d'abord`/`Plus ancien d'abord`), tous deux résolus via les query
  params `dateFrom`/`dateTo`/`sortOrder` du `GET`, jamais par un tri/filtre client.
- **Ajout/édition via un dialogue** (`InterviewFormDialog`, réutilisé pour les deux modes) :
  formulaire avec date, sujet, résumé, puis les trois champs de retour optionnels — chacun annoté
  d'un indice de visibilité ("Visible par le joueur" / "Privé — jamais visible par le joueur") pour
  que l'encadrant sache ce qu'il écrit où (`react-hook-form` + `zod`, même pattern que
  `PlayerFormDialog`). Le champ `staffId` n'est **jamais** proposé dans un sélecteur : il est
  assigné automatiquement côté backend au membre à l'origine de la requête (voir
  `PlayerInterviewsService.create`).
- **Suppression directe** depuis la carte (bouton icône, pas de confirmation dédiée — cohérent
  avec le reste du module).
- Comme pour les Mesures, la route ne porte pas `teamId` dans son URL naturelle
  (`/clubs/:clubId/players/:playerId/interviews`) : Coach (scope `TEAM`) et Player (scope `OWN`)
  doivent le transmettre en query pour être autorisés (voir `docs/modules/auth-roles.md`
  §"Patterns découverts").

### Notes — modèle de visibilité Privé/Semi-privé/Public

- **Timeline** (même présentation que l'onglet Entretien) : une carte par note, badge de
  visibilité en tête (`Privé` avec icône cadenas, `Semi-privé`, `Public`), titre optionnel,
  contenu, date de création et auteur.
- **Trois niveaux de visibilité, filtrés côté service selon le scope de l'appelant** : `PRIVE`
  (staff seulement), `SEMI_PRIVE` (joueur + staff), `PUBLIC` (parents + joueur + staff — voir
  `docs/decisions-ouvertes-et-rgpd.md`). Un Player (scope `OWN`) ne reçoit jamais les notes
  `PRIVE` — même tension RGPD Article 15 que `PlayerInterview.staffAssessment`. Le rôle Parent
  est câblé via la liaison `ParentChild` (scope `PARENT`, docs/modules/auth-roles.md §Rôle
  Parent) : plus restrictif que l'enfant lui-même, il ne reçoit que les notes `PUBLIC` (ni
  `PRIVE` ni `SEMI_PRIVE`). Le frontend ne fait aucune vérification de rôle : c'est l'absence de
  la note dans le tableau JSON renvoyé qui pilote l'affichage.
- **`authorId` auto-assigné**, jamais choisi dans un sélecteur (même pattern que
  `PlayerInterview.staffId`).
- **Filtre par plage de dates et tri, tous deux sur `createdAt`** (`PlayerNote` n'a pas de champ
  date métier propre) : `GET .../notes?dateFrom=...&dateTo=...&sortOrder=...`. `createdAt` est un
  horodatage complet (pas un `@db.Date` comme les autres onglets) — `dateTo` est étendu à la fin
  de la journée choisie côté service pour rester inclusif du jour entier (sans ce réglage, une
  note créée l'après-midi serait exclue par un filtre `dateTo` fixé au même jour).
- **Première ressource du module Effectif à appliquer dès sa conception** la vérification
  d'appartenance à l'équipe précise (`assertPlayerInTeam`) pour un scope `TEAM` — voir le
  correctif appliqué à Mesures/Entretien/Profil juste avant cette étape
  (`docs/modules/auth-roles.md` §Patterns découverts). Un Coach ne peut donc agir que sur les
  notes des joueurs réellement présents dans son équipe, jamais sur ceux d'une autre équipe du
  même club même en transmettant son propre `teamId`.

### Notation — unique dans toute l'application

Toutes les notes sont **sur 10**, stockées en `Decimal(4,1)` par paliers de 0.5, affichées en
**étoiles sur 5** dans l'UI (valeur / 2, demi-étoiles). Voir `docs/schema/index.md` §"Convention
de notation".

### Objectifs — 4 statuts, visibilité par défaut Semi-privé

- Statuts : **Programmé** (`PLANNED`), **En cours** (`IN_PROGRESS`), **Réussi** (`ACHIEVED`),
  **Échec** (`FAILED`). Thèmes : Technique, Physique, Mental, Tactique. Horizons : court/moyen/long
  terme. Aucune règle de transition entre statuts n'est imposée (freeform, cohérent avec
  "ne pas ajouter de complexité non demandée").
- **Réutilise le modèle de visibilité Privé/Semi-privé/Public de l'onglet Notes**, avec un défaut
  différent : **Semi-privé** au lieu de Privé (le joueur voit ses propres objectifs par défaut —
  defaulter à Privé était un bug identifié et corrigé). Même filtrage backend qu'ailleurs : un
  Player (scope `OWN`) ne reçoit jamais les objectifs `PRIVE` dans la réponse
  (`PlayerObjectivesService.findAllByPlayer`), le frontend affiche simplement ce que l'API renvoie.
- **Timeline** (même présentation que Entretien/Notes) : badges statut (couleur distincte par
  statut), thème et visibilité (icône cadenas si `PRIVE`) en tête de carte, description, dates
  optionnelles affichées seulement si renseignées (`startDate`/`dueDate`/`completedDate`),
  auteur (`assignedBy`, auto-assigné comme `PlayerInterview.staffId`/`PlayerNote.authorId`).
- **Filtres par statut, par thème ET par plage de dates** (tous combinables), en plus du tri
  (`sortOrder`), tous résolus côté backend
  (`GET .../objectives?status=ACHIEVED&theme=PHYSIQUE&dateFrom=...&dateTo=...&sortOrder=...`).
- **Tri et filtre de date sur `startDate`, pas `createdAt`** (décision du 2026-07-06) : la date de
  début a du sens pour l'utilisateur, contrairement à la date de saisie en base. `startDate` étant
  nullable (objectif pas encore planifié) :
  - au tri, les objectifs sans date sont **toujours classés en dernier**, quel que soit le sens
    (`orderBy: { startDate: { sort, nulls: 'last' } }`) — sans ce réglage explicite, Postgres
    place les `NULL` en tête en tri décroissant, ce qui ferait artificiellement remonter les
    objectifs non datés au sommet de la timeline ;
  - au filtre, un objectif sans `startDate` sort naturellement des résultats dès qu'une borne
    `dateFrom`/`dateTo` est active (`NULL` ne peut satisfaire aucune comparaison en SQL) — aucun
    traitement particulier à ajouter pour ce cas.
- **Conçus sans lien à une saison fixe** → suivi multi-saisons natif : un objectif reste
  `IN_PROGRESS` d'une saison à l'autre tant qu'il n'est pas `ACHIEVED` ou `FAILED`.
- Comme Notes, applique `assertPlayerInTeam` dès sa conception pour le scope `TEAM` (Coach) —
  voir `docs/modules/auth-roles.md` §Patterns découverts.

### Évaluation — radar dynamique, une évaluation = une session multi-critères

Le radar de l'onglet Évaluation est **dynamique** : ses axes correspondent aux
`ClubEvaluationConfig` du club où `isEnabled = true`, triées par `displayOrder`. Le nombre
d'axes n'est pas fixé à 6 — il reflète la configuration du club.

**6 catégories système football** (activées par défaut à la création de tout club football) :
Technique · Tactique · Physique · Mental · Émotionnel · Vie de groupe

**Ce qu'un club peut faire** :
- Désactiver une catégorie qui ne correspond pas à sa philosophie.
- Renommer une catégorie (ex. "Comportement" au lieu de "Vie de groupe").
- Réordonner les axes selon ses priorités.
- Ajouter une catégorie personnalisée (ex. "Vision de jeu" comme 7ème axe).
- Ajouter des critères personnalisés dans n'importe quelle catégorie.

**Extension multi-sports** : un club de basket verra des catégories différentes (définies
dans le seed pour `sport = BASKETBALL`). La logique de l'UI et du radar est identique —
seul le contenu du seed change. Aucune modification de code requise pour ajouter un sport.

Voir `docs/schema/joueurs.md` pour le détail des entités `EvaluationCategory`,
`ClubEvaluationConfig` et `EvaluationCriterion`.

**Décision du 2026-07-06 (revue après une première implémentation une-ligne-par-critère, jamais
commitée)** : une évaluation est **une session unique** où le coach note en un seul formulaire
tous les critères actifs du club, pas un formulaire par critère. Le radar affiche la session la
plus récente ; les sessions précédentes restent en base pour l'historique.

- **Deux modules distincts** (un par responsabilité, cohérent avec la convention "un module par
  concern") :
  - `evaluation-config` : lecture seule, `GET /clubs/:clubId/evaluation-config` — renvoie les
    axes du radar (`ClubEvaluationConfig` où `isEnabled = true`, triés par `displayOrder` ou à
    défaut `defaultDisplayOrder` de la catégorie), chacun avec ses critères (système + custom du
    club). Permission `evaluation_config READ`, pas de vérification joueur/équipe : la
    configuration est identique pour tout membre autorisé du club.
  - `player-evaluations` : CRUD des sessions, `.../players/:playerId/evaluations`, permission
    `player_evaluation`. Applique `assertPlayerInTeam` dès sa conception pour le scope `TEAM`
    (même pattern que Mesures/Entretien/Notes/Objectifs).
- **Une session note tous les critères actifs du club, obligatoirement** (pas de saisie
  partielle) : garantit que chaque catégorie a toujours une moyenne complète et comparable d'une
  session à l'autre. `PlayerEvaluation` porte `date`/`evaluatorId`/`comments` (commentaire global
  à la session, pas par critère) ; `PlayerEvaluationScore` (un par critère noté) porte le score,
  en relation `onDelete: Cascade` — supprimer une évaluation supprime tous ses scores.
- **Modifier une évaluation remplace intégralement ses scores** : le PATCH, s'il fournit
  `scores`, supprime tous les `PlayerEvaluationScore` existants de la session puis recrée
  l'ensemble transmis (pas de fusion partielle) — le formulaire d'édition réutilise exactement le
  même composant que la création, préremplit chaque critère avec son score existant.
- **Radar dynamique** : le nombre et l'ordre des axes viennent entièrement de la configuration du
  club, pas d'une liste fixe en code. Le point de chaque axe = moyenne, au sein de la session la
  plus récente, des scores dont le critère appartient à cette catégorie ; un axe sans aucun score
  dans cette session n'apparaît pas (cas résiduel seulement, si des critères ont été
  désactivés/ajoutés après coup). `RadarChart` (recharts) est rendu avec `outerRadius="62%"` et
  des marges généreuses (`margin={{ top: 24, right: 48, bottom: 24, left: 48 }}`) pour éviter que
  les libellés de catégories aux noms longs (ex. "Vie de groupe", "Émotionnel") ne soient
  tronqués sur les bords du graphique (retour du 2026-07-06).
- **Pas de contrainte append-only** (contrairement à `PlayerMeasurement`) : UPDATE est autorisé
  pour corriger une session — une évaluation n'a pas la même exigence d'audit qu'une mesure
  physique.
- **Validation dédiée `assertCriteriaInClub`** (vérifie l'ensemble des critères soumis en une
  fois via `count()`, pas un `findFirst` par critère) : chaque critère utilisé doit être système
  (`clubId: null`) ou appartenir au club du joueur évalué — empêche de noter un joueur sur un
  critère custom d'un autre club. Vérifiée à la création toujours, et à la modification
  seulement si `scores` est fourni.
- **Pas de champ `visibility`** (contrairement à Notes/Objectifs) : une évaluation est toujours
  visible par le joueur concerné (scope `OWN`, lecture seule) en plus du staff scopé TEAM/CLUB —
  pas de niveau Privé pour ce modèle.
- **`evaluatorId` auto-assigné** au membre à l'origine de la création (même pattern que
  `PlayerInterview.staffId`/`PlayerNote.authorId`/`PlayerObjective.assignedById`), jamais
  sélectionnable. `teamId` (contexte multi-équipe) existe en base mais n'est pas exposé par
  l'API pour l'instant. `trainingSessionId`/`matchId` (liens optionnels vers une séance/un
  match) sont différés aux Phases 5/4 — ces modèles n'existent pas encore, aucune colonne
  correspondante en base pour l'instant — voir `docs/schema/joueurs.md`.
- **Filtres par plage de dates** (`dateFrom`/`dateTo`) plus le tri (`sortOrder`), résolus côté
  backend — même convention que les autres onglets. Pas de filtre par critère : une évaluation
  est une session multi-critères, ce filtre n'a plus de sens à cette granularité.
- **Formulaire de saisie compact** (retour du 2026-07-06 — la première version listait un critère
  par ligne, jugée trop longue) : les critères sont groupés par catégorie, affichés en grille de
  2-3 colonnes (nom du critère au-dessus, étoiles en dessous), pas une liste verticale d'une
  ligne par critère.
- **Saisie en étoiles sur 5 avec demi-étoile** (`StarRatingInput`,
  `src/components/ui/star-rating-input.tsx`) : chaque étoile est divisée en deux zones cliquables
  (moitié gauche = demi-étoile, moitié droite = étoile pleine), donnant 10 valeurs possibles par
  critère (1 à 10, pas de granularité 0.5 supplémentaire en dessous du point entier — cohérent
  avec la convention "étoiles sur 5" de CLAUDE.md, la précision au 0.5 du champ `Decimal(4,1)` en
  base sert d'autres besoins futurs, pas la saisie via ce widget). Version lecture seule
  distincte : `StarRating` (`src/components/ui/star-rating.tsx`).
- **Tableau d'historique sans étoiles** (retour du 2026-07-06 — les étoiles rendaient le tableau
  trop étiré) : une ligne par session (date), une colonne par catégorie affichant la **moyenne en
  chiffre** (`average.toFixed(1)`, pas de rendu `StarRating`) — exception documentée à la
  convention "étoiles sur 5" pour ce tableau précis, les étoiles restant utilisées partout
  ailleurs (formulaire de saisie).

---

## Modèle de visibilité (Privé / Semi-privé / Public)

Trois niveaux de visibilité, appliqués aux `PlayerNote` et `PlayerObjective` :

- **Privé** : visible uniquement par le staff (rôles avec droits d'écriture sur ce joueur). Le
  joueur lui-même ne voit pas.
- **Semi-privé** : visible par le joueur concerné + le staff.
- **Public** : visible par le joueur, les parents rattachés, et le staff — coaches d'autres
  équipes du même club exclus, même en Public.

Audiences confirmées et implémentées (`NoteVisibility`), voir `docs/decisions-ouvertes-et-rgpd.md`
pour la décision tranchée. Tension RGPD associée (Article 15) : voir ce même fichier.

---

## Joueurs sans compte

Un joueur peut ne pas avoir de compte `User` propre (cas fréquent pour les plus jeunes
catégories). Dans ce cas :
- Un `Member` est créé sans `User` associé (ou avec un compte créé par un responsable).
- Ses présences peuvent être confirmées par un `Parent` rattaché (`TrainingAttendance.confirmedByParent`).
- Les convocations sont envoyées au(x) parent(s) rattaché(s).

---

## Lien avec les autres modules

- L'onglet **Blessure** s'appuie sur le module Blessures — qui peut influer sur la disponibilité
  du joueur dans le calendrier et les convocations.
- Les `PlayerEvaluation` pourront être liées à une séance (`trainingSessionId`) ou à un match
  (`matchId`) une fois `TrainingSession`/`Match` implémentés (Phases 5/4) — aucune colonne
  correspondante n'existe encore en base (voir `docs/schema/joueurs.md`).
- Le module **Matchs** alimente les statistiques affichées dans le Dashboard du joueur.
