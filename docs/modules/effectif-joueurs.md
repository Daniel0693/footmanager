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
> `firstName`/`lastName`/`phone`/`email`/`birthDate` du `Member`/`User`
> lié, `jerseyNumber`/`mainPosition`/`secondaryPositions` pour les joueurs uniquement,
> `isArchived`), triée/paginée en mémoire (volume par équipe trop faible pour justifier une
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
>   existant par son `id` cette fois non modifiable. `gender` n'est pas dans `RosterRow`
>   (voir B1) : toujours "Non renseigné" au chargement, envoyé (donc modifié) seulement si
>   explicitement choisi.
>
> Vérifié en live (création de deux lignes, édition en masse du nom d'une ligne, rollback
> complet + modale qui reste ouverte sur un conflit de maillot volontairement provoqué) en
> plus des tests unitaires.

Tableau par équipe (voir le tableau unifié Joueurs + Staff plus haut pour les colonnes
actuelles). Deux filtres de poste combinables (en plus du filtre Statut) :
- **Par ligne** (Gardien/Défense/Milieu/Attaque) — la ligne n'est pas stockée en base, elle est
  dérivée du poste précis en code (voir `docs/schema/index.md` §enum `Position`). Sélectionner
  une ligne réduit les postes proposés dans le second filtre à ceux de cette ligne.
- **Par poste précis** (15 postes réels, voir `docs/schema/index.md`) — filtre sur
  `mainPosition` uniquement ; les postes secondaires sont affichés mais non filtrables.

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
- **Trois niveaux de visibilité, un seul filtré côté service** : `PRIVE` (staff seulement),
  `SEMI_PRIVE` (joueur + staff), `PUBLIC` (parents + joueur + staff — voir
  `docs/decisions-ouvertes-et-rgpd.md`). Le rôle Parent n'étant pas encore câblé sur le module
  Effectif (pas de table de liaison Parent↔Joueur), seule la distinction PRIVE vs
  SEMI_PRIVE/PUBLIC est réellement appliquée aujourd'hui : un Player (scope `OWN`) ne reçoit
  jamais les notes `PRIVE` dans la réponse — même tension RGPD Article 15 que
  `PlayerInterview.staffAssessment`. Le frontend ne fait aucune vérification de rôle : c'est
  l'absence de la note dans le tableau JSON renvoyé qui pilote l'affichage.
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

- **Privé** : visible uniquement par les rôles strictement supérieurs (staff avec droits
  d'écriture sur ce joueur). Le joueur lui-même ne voit pas.
- **Semi-privé** : visible par le sujet (le joueur concerné) + les rôles supérieurs.
- **Public** : visible par le joueur, les parents rattachés, et les rôles avec accès à l'équipe.

**Le détail exact des audiences par rôle pour chaque niveau doit être vérifié par rapport aux
artefacts UI/prototypes produits**, puis documenté ici une fois confirmé. Tension RGPD associée
(Article 15) : voir `docs/decisions-ouvertes-et-rgpd.md`.

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
