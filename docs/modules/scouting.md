# Module — Scouting (Rapports d'observation)

## Vision

Deux types de rapports distincts, qui peuvent vivre ensemble ou séparément :

1. **`TeamScoutingReport`** : analyse d'une équipe adverse — système de jeu, organisation par
   phase de jeu, joueurs clés collectivement, recommandations tactiques.
2. **`PlayerScoutingReport`** : observation d'un joueur précis — évaluation individuelle
   multidimensionnelle, recommandation de recrutement.

**Relations possibles** :
- Un `TeamScoutingReport` peut contenir des `PlayerScoutingReport` sur des joueurs observés
  lors de ce même match.
- Un `PlayerScoutingReport` peut exister seul (observation isolée d'un joueur sans analyse de
  son équipe) ou être rattaché à un `TeamScoutingReport`.
- Les deux peuvent être rattachés à un `ChampionshipMatch` ou exister hors de tout championnat.

**Visibilité** : scopés au **Club**. Tout le staff technique du club peut consulter les deux
types de rapports. Players et Parents exclus (information stratégique).

**Rôle "Recruteur"** : pas de rôle système dédié — c'est un **preset de rôle dynamique**
proposé dans le catalogue de rôles personnalisables. Un AdminClub crée le rôle "Recruteur"
avec les permissions `scouting READ/CREATE/UPDATE CLUB` et `external_player READ/CREATE CLUB`,
sans accès aux séances ou aux données internes de l'équipe. Tous les clubs n'ont pas de
recruteur dédié — certains clubs laissent le coach avoir les deux casquettes.

---

## 1. TeamScoutingReport — Rapport d'analyse d'équipe

### Bloc 1 — Contexte du match observé

- Date et lieu de la rencontre.
- Équipe domicile / Équipe extérieure (deux `ExternalTeam`).
- Équipe cible du rapport : `targetExternalTeamId` (l'équipe qu'on analyse).
- Lien optionnel : `championshipMatchId` si le match fait partie d'un championnat suivi.
- Si hors championnat : `observedHomeTeamId` + `observedAwayTeamId` directement.

### Bloc 2 — Système de jeu

- Formation de départ (string : "4-3-3", "3-5-2"...).
- Tags de style de jeu (liste prédéfinie + tags libres du club — voir §PlayingStyleTag).

### Bloc 3 — Phases de jeu (6 sections guidées)

| Section | Ce qu'on y évalue |
|---|---|
| Organisation offensive | Comment l'équipe attaque en phase de possession |
| Organisation défensive | Bloc défensif, pressing, lignes de repli |
| Transition offensive | Comportement à la récupération du ballon |
| Transition défensive | Comportement à la perte du ballon |
| Phases arrêtées offensives | Corners, coups francs, touches en attaque |
| Phases arrêtées défensives | Organisation défensive sur phases arrêtées |

Sections **affichées et guidées dans l'UI**, avec placeholder explicatif. Nullables en base —
un rapport partiel est acceptable.

### Bloc 4 — Joueurs clés observés

Liens vers des `PlayerScoutingReport` existants sur des joueurs vus lors de ce match. Un
rapport d'équipe peut avoir 0..N joueurs clés associés. Ces joueurs peuvent aussi avoir des
rapports indépendants créés avant ou après ce rapport d'équipe.

### Bloc 5 — Synthèse

- Points forts de l'équipe (texte).
- Points faibles de l'équipe (texte).
- Recommandations tactiques pour préparer la prochaine rencontre (texte).
- Note globale de l'équipe adversaire : `Decimal(4,1)`, sur 10.
- Notes libres (texte).

---

## 2. PlayerScoutingReport — Rapport d'observation d'un joueur

### Bloc 1 — Contexte du joueur observé

- `ExternalPlayer` cible (nullable — si le joueur n'est pas encore créé).
- Si le joueur n'a pas d'équipe connue : `ExternalPlayer.externalTeamId = null`. L'équipe peut
  être assignée plus tard quand elle est connue.
- Poste observé dans cette rencontre (peut différer du poste habituel de l'`ExternalPlayer`).
- Date d'observation.
- Contexte de l'observation :
  - Lien vers `TeamScoutingReport` si l'observation fait partie d'un rapport d'équipe.
  - Lien vers `ChampionshipMatch` si c'est un match de championnat.
  - Sinon : champ libre "contexte" (ex. "Tournoi hivernal de Zoug", "Entraînement ouvert").

### Bloc 2 — Évaluation par dimension et critères

Quatre dimensions, chacune composée de **critères notés individuellement** (sur 10,
`Decimal(4,1)`). Une note de synthèse par dimension est calculée automatiquement depuis la
moyenne des critères de cette dimension. Ce modèle est analogue à `EvaluationCriterion` +
`PlayerEvaluation` pour les joueurs internes, mais dans une table distincte.

**Critères système pré-définis par dimension** :

| Dimension | Critères |
|---|---|
| PHYSIQUE | Gabarit / morphologie · Vitesse de déplacement · Endurance / condition physique · Puissance / force |
| TECHNIQUE | Contrôle de balle (1er touché) · Passe courte · Passe longue / centre · Frappe de balle · Dribble / 1c1 · Jeu de tête · Utilisation du pied faible |
| TACTIQUE | Placement sans ballon · Lecture du jeu · Prise de décision · Pressing et récupération · Utilisation de l'espace |
| MENTAL | Concentration et régularité · Leadership · Attitude et comportement · Combativité · Résilience face à l'adversité |

**Critères personnalisés** : un club peut ajouter des critères propres à une ou plusieurs
dimensions (table `PlayerScoutingCriterion` avec `clubId`). Ces critères apparaissent dans
tous les rapports de joueur du club.

Chaque critère noté peut recevoir un commentaire court optionnel.

### Bloc 3 — Synthèse

- Points forts observés (texte).
- Points faibles observés (texte).
- Note globale (calculée depuis la moyenne des 4 dimensions, modifiable manuellement).
- Notes libres.

### Bloc 4 — Recrutement

| Champ | Type | Options |
|---|---|---|
| Recommandation | enum `ScoutingRecommendation` | `NON_PERTINENT` / `A_SUIVRE` / `A_APPROCHER` / `A_RECRUTER` |
| Urgence | enum `ScoutingUrgency` | `AUCUNE` / `FAIBLE` / `MOYENNE` / `HAUTE` |
| Notes de recrutement | text | observations confidentielles, contexte contractuel... |

---

## PlayingStyleTag — Tags de style de jeu (TeamScoutingReport)

Tags système (`isSystem = true`, `clubId = null`) — prédéfinis, non supprimables :
```
pressing-haut · contre-attaque · possession · jeu-long · bloc-bas · repli-rapide ·
jeu-direct · jeu-en-triangle · largeur-du-jeu · jeu-combinatoire ·
transitions-rapides · physique-dominant
```

Tags libres (`isSystem = false`, `clubId non-null`) : créés par un utilisateur du club,
**stockés et réutilisables** pour tous les rapports de ce club. Un coach crée "4-4-2-compact"
une fois, il le retrouve dans tous ses prochains rapports.

---

## ExternalPlayer — Joueur sans équipe connue

`ExternalPlayer.externalTeamId` est **nullable**. Un joueur peut être créé sans équipe connue
(vu en tournoi, contexte inconnu). Le workflow recommandé :
1. Créer l'`ExternalPlayer` avec `externalTeamId = null` et les informations disponibles.
2. Rédiger le `PlayerScoutingReport`.
3. Quand le club du joueur est identifié : assigner `externalTeamId` sur l'`ExternalPlayer`.
   Tous les rapports existants sur ce joueur bénéficient automatiquement de cette information.

---

## Lien entre les deux types de rapports

```
TeamScoutingReport
  ├── context : ChampionshipMatch (optionnel) ou ExternalTeam pair + date
  ├── targetExternalTeamId
  └── keyPlayers[] → PlayerScoutingReport[]   (0..N, lien optionnel)

PlayerScoutingReport
  ├── externalPlayerId (nullable si joueur non encore créé)
  ├── teamScoutingReportId (nullable — rapport d'équipe associé)
  ├── championshipMatchId (nullable)
  ├── freeContextText (nullable — si hors championnat et hors rapport d'équipe)
  └── PlayerScoutingEvaluation[] (un par PlayerScoutingCriterion noté)
```

---

## Base de connaissance adversaire

Au fil des saisons, les données s'accumulent sur `ExternalTeam` et `ExternalPlayer`. Un coach
peut consulter :
- Tous les `TeamScoutingReport` sur un adversaire donné (tendances récurrentes sur plusieurs
  saisons).
- Tous les `PlayerScoutingReport` sur un joueur précis (évolution observée, historique des
  rapports d'autres recruteurs du club).

C'est la valeur à long terme du module — pas juste un outil de préparation match, mais une
base de connaissance qui s'enrichit dans le temps.

---

## Droits par rôle

| Action | Coach (son club) | AdminClub | Recruteur (rôle dynamique) | Player / Parent |
|---|---|---|---|---|
| Créer un rapport équipe ou joueur | ✅ | ✅ | ✅ | ❌ |
| Lire les rapports du club | ✅ | ✅ | ✅ | ❌ |
| Modifier son propre rapport | ✅ | ✅ | ✅ | ❌ |
| Modifier le rapport d'un autre | ❌ | ✅ | ❌ | ❌ |
| Gérer ExternalTeam / ExternalPlayer | ✅ | ✅ | ✅ | ❌ |
| Gérer les tags libres du club | ✅ | ✅ | ✅ | ❌ |
| Voir les notes de recrutement | ✅ | ✅ | ✅ | ❌ |
