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
| Historisation des saisons | Révisé en Phase 3 (A14) : `Season` est club-wide, pas d'historisation de nom/catégorie par équipe (`teamNameSnapshot`/`categorySnapshot` envisagés puis retirés du schéma, jamais alimentés). Roster et staff historisés via `joinDate`/`leaveDate` sur `PlayerTeam`/`TeamStaff`. |
| 6 catégories du radar d'évaluation | Technique · Tactique · Physique · Mental · Émotionnel · Vie de groupe. Système rendu dynamique via `EvaluationCategory` + `ClubEvaluationConfig`. Configurable par club. Extensible par sport. |
| Modèle de visibilité Privé/Semi-privé/Public | Privé = staff seulement. Semi-privé = joueur + staff. Public = parents + joueur + staff. Coaches d'autres équipes du même club exclus (même en PUBLIC). Voir `effectif-joueurs.md`. |
| Club.sport | Ajouté sur `Club` dès le MVP (`SportType` enum, défaut FOOTBALL). |
| EvaluationCategory comme entité propre | `category` (String) remplacé par `categoryId` (FK → EvaluationCategory). |
| Workflow de transition de saison | Révisé en Phase 3 (A14) : plus de wizard dédié — `Season` étant club-wide, l'activation se fait directement (`POST :id/activate`), sans étape d'import roster/config séparée. Saison archivée modifiable. |
| Season.status | DRAFT / ACTIVE / ARCHIVED. Une seule ACTIVE par Club (révisé en A14 — auparavant par Team) à tout instant. |
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
| Correctif — vérification équipe pour un scope `TEAM` | Faille trouvée en concevant A7.3 : `PlayersService`, `PlayerMeasurementsService` et `PlayerInterviewsService` ne vérifiaient que l'appartenance au club, jamais à l'équipe précise transmise en `?teamId=` — un Coach pouvait agir sur n'importe quel joueur du club en transmettant sa propre équipe. Corrigé via `assertPlayerInTeam` (`src/common/player-team-membership.ts`), à réutiliser pour toute nouvelle ressource scopée équipe. Voir `docs/modules/auth-roles.md` §Patterns découverts. |
| Liaison Parent ↔ Joueur | Nouvelle table `ParentChild` + scope `PermissionScope.PARENT`, créée/supprimée uniquement par le staff. Droits du Parent sur son enfant lié : consultation (mêmes ressources que le scope `OWN` de l'enfant, sauf notes/objectifs limités à `PUBLIC`), modification des informations personnelles (`member`, jamais `player_profile`/`player_team`), déclaration d'absence à venir (`isExcused` forcé à `null`, comme pour l'enfant lui-même). Voir `docs/modules/auth-roles.md` §Rôle Parent. |
| Unicité de `PlayerProfile.licenseNumber` (2026-07-16) | Retirée en tant que contrainte SQL globale — une licence est numérotée par fédération nationale, pas mondialement, et FootManager n'a pas à arbitrer une correspondance entre deux clubs différents (transfert, doublon ou coïncidence indistinguables depuis nos données). Remplacée par une vérification applicative scopée au club (via `Member.clubId`), portant sur tous les `Member` du club (actifs ou non — un membre qui repart puis revient doit être rapproché de son historique, pas bloqué par lui), `null` toujours exclu. Voir `docs/schema/joueurs.md` §PlayerProfile. |
| Modèle de rapprochement joueur (2026-07-16) | Toute création (import fichier ou création manuelle) passe par un service de rapprochement partagé, scopé intra-club pour l'instant (licence exacte puis nom+prénom+date de naissance en repli — l'email est volontairement exclu, voir décision ouverte ci-dessous). Trois statuts : **Nouveau** (aucune correspondance), **Modification** (correspondance déjà active dans l'équipe précise visée), **Réactivation** (correspondance trouvée mais pas active dans cette équipe — retour dans la même équipe après un départ, ou déjà actif dans une autre équipe du même club, flux déjà existant depuis A18). Une correspondance ambiguë (plusieurs candidats sur le repli nom+date de naissance) affiche la liste des candidats, avec la possibilité de forcer une création si aucun ne convient. Refuser une réactivation proposée crée un nouveau membre plutôt que de forcer un rapprochement. Voir `docs/modules/effectif-joueurs.md` (à venir avec l'implémentation). |

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
- **Calendriers externes (abonnement ICS)** — reporté explicitement le 2026-07-08 : pas
  nécessaire au MVP. Décision déjà prise si repris un jour : abonnement par URL ICS (Google
  Calendar, iCloud, flux de jours fériés), lecture seule, cache backend (nouvelles tables
  `ExternalCalendarSubscription`/`ExternalCalendarEvent`) rafraîchi périodiquement plutôt qu'un
  fetch live à chaque affichage — pas d'intégration OAuth. Gestion des abonnements réservée à
  AdminClub/SuperAdmin ; lecture des événements fusionnés ouverte à qui a déjà `event READ`.

### 4bis. Anniversaires — port de scope non couvert

`MembersService.findBirthdaysInClub` (2026-07-08) restreint le scope TEAM aux membres rattachés
via `MemberRole` (staff) ou `PlayerTeam` actif (joueurs). La liaison Parent↔Enfant (`ParentChild`,
décision #5 ci-dessus) ne change rien ici : un Parent voit les anniversaires de l'équipe pointée
par son propre `MemberRole` (typiquement celle de son enfant), via le même raccourci "mine" déjà
documenté pour tout rôle scopé équipe sans permission Calendrier précise — voir
`docs/modules/auth-roles.md` §Patterns découverts (paragraphe sur les agrégations "mine") et
§Rôle Parent pour le détail. Exposition acceptée, limitée aux coéquipiers de l'enfant.

### 5. Liaison Parent ↔ Joueur — tranchée, voir table ci-dessus

Résolue (`ParentChild` + scope `PermissionScope.PARENT`) — déplacée dans la table des décisions
tranchées en tête de ce fichier. Détail complet : `docs/modules/auth-roles.md` §Rôle Parent.
Numéro conservé pour ne pas invalider les renvois "décision ouverte #6" ci-dessous.

### 6. `PermissionsService.matchesContext()` exige `teamId` même pour un scope `OWN`

**Trouvé le 2026-07-07 (A8, smoke test bout-en-bout)** : `matchesContext()`
(`backend/src/roles/permissions.service.ts`) exige que `context.teamId` corresponde au `teamId`
du `MemberRole` dès que celui-ci est non-null — **y compris quand la permission accordée est en
scope `OWN`**, qui ne devrait conceptuellement pas dépendre d'une équipe (`OWN` = "mes propres
données", pas "les données de mon équipe"). Conséquence concrète : un Player dont le
`MemberRole` porte un `teamId` (le cas normal — un joueur appartient à une équipe précise) reçoit
un 403 sur `GET .../measurements|interviews|notes|objectives|evaluations` s'il omet `?teamId=`
dans la requête, **même pour lire ses propres données**.

**Aucun impact utilisateur aujourd'hui** : la fiche joueur vit à
`/clubs/:clubId/teams/:teamId/players/:playerId`, donc chaque onglet transmet toujours
`?teamId=` (voir `docs/modules/effectif-joueurs.md`) — le frontend ne déclenche jamais ce cas.
Risque latent pour un futur client qui appellerait ces endpoints sans connaître le `teamId`
(app mobile, script, futur écran "mon profil" en libre-service comme `GET
/clubs/:clubId/players/me`).

**Piste de correction envisagée (non implémentée)** : `matchesContext()` pourrait ignorer la
correspondance de `teamId` lorsque la permission évaluée est en scope `OWN` — mais c'est une
modification du cœur du moteur RBAC partagé par **tous** les modules déjà livrés, pas seulement
Effectif, donc à traiter avec une revue de non-régression multi-rôles complète (règle d'or de
CLAUDE.md), pas en correctif ponctuel. À trancher avant d'exposer un nouveau client qui
consommerait ces endpoints sans passer par la fiche joueur classique.

### 7. Réactivation inter-club et liaison de compte via email

Discuté le 2026-07-16 en concevant le modèle de rapprochement joueur (import fichier +
création manuelle, voir table des décisions tranchées ci-dessus) : un membre qui change de club
ne peut techniquement jamais être "le même" `Member`/`PlayerProfile` que dans son ancien club
(`Member` est scopé à un club, `docs/schema/fondations.md`) — un transfert inter-club est donc
toujours une création dans le nouveau club. Ce qui peut néanmoins être réutilisé, c'est le compte
`User` existant (identité de connexion, non scopée à un club — un même `User` peut déjà être
`Member` de plusieurs clubs), pour éviter un doublon de compte.

**Volontairement hors scope de l'implémentation actuelle du rapprochement** (import + création
manuelle, intra-club uniquement pour l'instant) : le seul signal fiable pour reconnaître qu'un
compte existe déjà à travers deux clubs différents est l'email — jamais le numéro de licence
(voir décision tranchée ci-dessus) ni le nom/date de naissance à l'échelle globale (trop de faux
positifs, et une question de confidentialité : un club n'a pas à pouvoir sonder l'identité des
membres d'un autre club).

**Mécanisme envisagé, à concevoir en détail le moment venu** : détecter la correspondance par
email déclenche une notification (applicative et/ou email) adressée au titulaire du compte trouvé,
lui demandant explicitement soit de lier son compte existant au nouveau club/équipe, soit — si
c'est sa toute première authentification — d'en créer un nouveau. Jamais une liaison silencieuse
décidée unilatéralement par le staff du club receveur (contrairement à la création d'un `Member`
sans compte, qui reste, elle, une action purement staff). Dépend directement du système de
notifications (décision ouverte #2, non spécifié) — à concevoir ensemble, après les autres
modules plutôt qu'en prérequis de l'import/de la création manuelle.

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
