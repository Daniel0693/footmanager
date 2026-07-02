# Module — Auth & Rôles

## Mécanisme d'authentification

- **JWT** : access token de courte durée + refresh token.
- Le refresh token est stocké en **cookie httpOnly** (non accessible en JS côté client).
- **Silent refresh** : le front renouvelle l'access token de façon transparente avant expiration.
- Les tokens sont invalidés côté serveur (table `RefreshToken` avec champ `revokedAt`).

---

## Rôles fixes (système)

Ces rôles sont intégrés à l'application, non supprimables (`isSystem = true`, `clubId = null`).
Ils correspondent à des ensembles de permissions pré-configurés.

| Rôle | Description |
|---|---|
| `Player` | Joueur — accès à son profil, calendrier, convocations, feedback |
| `Parent` | Parent d'un joueur — convocations, confirmation de présence, suivi de l'enfant |
| `Coach` | Entraîneur — gestion complète de séances, matchs, évaluation joueurs (scopé équipe) |
| `AdminClub` | Administrateur d'un club — gestion de l'effectif, des équipes, lecture de tout |
| `SuperAdmin` | Rôle technique le plus élevé — accès multi-club et administration de la plateforme |
| `Proprietaire` | **Au-dessus de SuperAdmin** — propriétaire du club, mécanisme de transfert sécurisé |

**`Proprietaire`** est implémenté dès le MVP. Son transfert (succession) nécessite un mécanisme
sécurisé (ex. validation par email + délai de confirmation, ou validation à double facteur) pour
éviter tout transfert accidentel ou frauduleux. Ce mécanisme est à concevoir et documenter avant
l'implémentation.

---

## Rôles personnalisés (dynamiques)

Les rôles personnalisés sont créés via l'interface graphique par un `AdminClub` (scope club) ou
un `SuperAdmin`/`Proprietaire` (scope plateforme). Ils partagent la table `Role` avec les rôles
fixes, distingués par `isSystem = false` et `clubId` non null (pour un rôle propre à un club).

**Exemple** : un `AdminClub` crée le rôle `Physiotherapeute`, lui attribue les permissions
`injury READ TEAM` et `injury UPDATE TEAM`. Un `Member` reçoit ce rôle via `MemberRole`,
scopé aux équipes où il intervient.

### Permissions granulaires

Chaque permission est la combinaison de trois dimensions :
1. **Ressource** (`resource`) : ex. `injury`, `training_session`, `member_note`, `player_profile`
2. **Action** (`action`) : `READ`, `CREATE`, `UPDATE`, `DELETE`
3. **Scope** (`scope`) : `OWN` (ses propres données), `TEAM` (ses équipes), `CLUB` (son club), `ALL`

L'interface de gestion des rôles expose ces trois dimensions de façon lisible (libellés traduits
via i18n) pour permettre à un AdminClub non-développeur de configurer un rôle personnalisé.

---

## Attribution des rôles — MemberRole

La table `MemberRole` est l'unique source de vérité sur "qui a quel rôle où". Elle lie un
`Member` à un `Role`, scopé à un `Club` et/ou une `Team` (champs nullable selon le rôle).

Exemples :
```
{ memberId: 42, roleId: Coach,    clubId: 1, teamId: 5  }  → Coach de l'équipe U15
{ memberId: 42, roleId: Player,   clubId: 1, teamId: 8  }  → Joueur dans l'équipe Seniors
{ memberId: 42, roleId: Parent,   clubId: 2, teamId: 12 }  → Parent dans un autre club
```

Ce membre a trois rôles distincts, dans trois contextes distincts, avec trois jeux de droits
distincts. Toute évaluation de permission doit considérer le contexte de l'action demandée,
pas un rôle "global" de l'utilisateur.

---

## Règle d'or — évaluation des permissions

**Toujours évaluer la permission via `MemberRole` + `RolePermission`, scopée au contexte
précis de l'action.** Ne jamais court-circuiter ce système.

❌ Interdit :
```ts
if (user.role === 'SuperAdmin') return true;  // contourne le scope
if (user.roles.includes('AdminClub')) return true;  // ignore le club concerné
```

✅ Correct (pseudo-code) :
```ts
function can(member, action, resource, { clubId, teamId }): boolean {
  const roles = getMemberRolesInScope(member, clubId, teamId);
  return roles.some(role =>
    roleHasPermission(role, resource, action, { clubId, teamId })
  );
}
```

**Pourquoi cette règle est critique** : plusieurs modules ont dû être retouchés après coup
à cause de raccourcis de permission. C'est un risque structurel récurrent — documenter ici
tout cas limite découvert pour éviter de répéter l'erreur.

---

## Cas particuliers documentés

### Staff technique d'une équipe (Coach, Co-entraîneur, Adjoint)

La table `TeamStaff` (`staffRole` : `PRINCIPAL`, `CO_ENTRAINEUR`, `ADJOINT`) définit le rôle
précis d'un Coach au sein d'une équipe. En termes de droits applicatifs :
- **Parité complète** entre `PRINCIPAL`, `CO_ENTRAINEUR` et `ADJOINT` sur la gestion de
  l'équipe (séances, matchs, évaluations).
- **Exception unique** : un Adjoint ou Co-entraîneur ne peut pas modifier la fiche
  `TeamStaff` de l'Entraîneur principal (protection contre l'auto-promotion).

### Multi-rôles — règle de test obligatoire

**Toute modification touchant aux droits doit être testée avec au moins un scénario multi-rôles
avant merge.** Exemple de scénario de référence :

> Marc est Coach de l'équipe U15 (Club A), Player dans l'équipe Seniors (Club A), et Parent
> d'un joueur dans l'équipe U10 (Club B).
> - En tant que Coach U15 : il voit et édite les séances/matchs de l'U15, pas des autres.
> - En tant que Player Seniors : il voit son propre profil et les événements Seniors, sans
>   accès aux données des autres joueurs.
> - En tant que Parent Club B : il voit le calendrier et les convocations de l'équipe U10 de
>   son enfant, sans aucun accès au Club A via ce rôle.

Si une modification de la logique de permission casse ce scénario dans un sens ou dans l'autre,
elle ne peut pas être mergée.

### Propriétaire — mécanisme de transfert sécurisé

Le transfert du rôle `Proprietaire` doit passer par une procédure sécurisée (à détailler avant
implémentation) : validation par email, délai de confirmation, log d'audit irréversible.

---

## Tests de permission — exigences minimales

Pour chaque module, une suite de tests doit couvrir :
1. Un utilisateur sans aucun rôle ne peut rien faire.
2. Chaque rôle système peut faire exactement ce qu'il doit faire (ni plus, ni moins).
3. Un rôle scopé équipe A ne peut pas accéder aux données de l'équipe B.
4. Un scénario multi-rôles (au moins un test du type "Marc" décrit ci-dessus).
5. Un rôle personnalisé avec permissions limitées respecte ces limites.
