# Module — Suivi des blessures et rétablissement

> Module Phase 6 de la roadmap. S'adresse aux différents intervenants du staff (préparateur
> physique, médecin du club, kiné, entraîneur...) et offre une vue centralisée de l'historique
> médical des joueurs.

Entités associées (détail des champs : `docs/schema-bdd.md` §12) : `Injury`,
`InjuryAssignment`, `InjuryRehabEvent`.

## Enregistrement d'une blessure

Pour chaque blessure : nature (entorse, fracture, déchirure musculaire...), emplacement
(cheville, genou, poignet, hanche...), degré de gravité (léger, modéré, grave), date de
survenue, durée d'indisponibilité estimée, et éventuellement la cause/le contexte (ex.
"blessure à l'entraînement" vs "accident hors terrain"). Apparaît dans le dossier médical du
joueur concerné.

## Blessures multiples simultanées

Le système doit gérer plusieurs blessures **actives en même temps** pour un même joueur, chacune
suivant son propre cycle de rétablissement indépendant (ex. genou luxé + poignet fracturé après
une même chute : deux cycles de guérison séparés). L'interface joueur affiche la liste de
toutes les blessures, en cours et passées.

## Intervenants

Un ou plusieurs membres du staff peuvent être assignés au suivi d'une blessure donnée
(médecin, kinésithérapeute, préparateur physique, entraîneur — selon la taille du club). Les
intervenants assignés peuvent ajouter des notes et mettre à jour l'état de la blessure
(diagnostic, traitement, exercices de renforcement, etc.) directement via la plateforme.

## Plan de rééducation et suivi du retour

Timeline chronologique d'événements datés (repos, exercice, test médical...), chacun avec une
description, une date ou plage de dates, et un type. Exemple :
*"01/10–07/10 : repos complet" → "08/10 : reprise vélo 30 min" → "10/10 : séance de
physiothérapie" → "15/10 : entraînement léger sans contact"*.

Les intervenants assignés peuvent valider les étapes réalisées, ajouter des commentaires
d'observation (douleur résiduelle, progrès constatés) et ajuster le planning si nécessaire.

## Statut et réintégration

Tant qu'une blessure est `EN_COURS`, le joueur peut apparaître avec un statut "blessé" dans la
liste de l'effectif et sur les convocations de match — évitant de le sélectionner par
inadvertance. Une fois la blessure marquée `RETABLI` (et en l'absence d'autre blessure active),
cette indication disparaît automatiquement.

Intégration prévue, **légère** (pas un couplage fort) : module calendrier/présences pour
automatiser l'indisponibilité sur la période, et alerte optionnelle si on tente de convoquer un
joueur non rétabli. Cette intégration est une amélioration UX appréciable mais pas
indispensable au fonctionnement du suivi médical lui-même.

## Historique et prévention des rechutes

Toutes les blessures (terminées ou en cours) sont conservées dans l'historique du joueur. But :
identifier des fragilités/tendances (ex. 3 blessures à la cheville en 2 ans → signal à mettre en
évidence, via un compteur ou un tag). Statistiques médicales basiques au niveau de l'équipe
(nombre total de blessures par saison, zones du corps les plus touchées) — volet analytique
simple dans un premier temps, enrichissable plus tard.

Export PDF/Excel de l'historique médical par joueur : fonctionnalité prévue, pas nécessairement
dans le tout premier incrément du module.

## Note de planification

Ce module a été chiffré à environ **2 semaines** de développement supplémentaire (portant le
total estimé du MVP à ~3,5 mois au lieu de ~3 mois) — voir `docs/roadmap.md`. Il s'implémente
après les autres fondamentaux (joueurs, utilisateurs/staff, calendrier déjà en place).
