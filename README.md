# ricossay

test de ricossay

---

# Entraîneur « Ricochay » — APC mk2

Application web d'entraînement à l'épreuve dite **de Ricochay** : deux manivelles
orthogonales (X horizontal, Y vertical) déplacent un point à l'écran, et le sujet
doit maintenir ce point sur une **cible qui se déplace automatiquement le long d'une
trajectoire**, le plus longtemps possible.

Les deux manivelles sont les **boutons rotatifs (encodeurs) d'un Akai APC mk2**,
connecté en USB et lu via l'**API Web MIDI** du navigateur. L'application prévoit
l'**apprentissage automatique des boutons** (MIDI learn) et la **calibration des
butées** : aucun réglage manuel de numéros de CC n'est nécessaire.

Aucune dépendance, aucun build : page statique en HTML/CSS/JS vanilla.

## Standards de l'épreuve (recherche effectuée)

- **Principe** : poursuite bimanuelle (*pursuit tracking*) — la cible avance à vitesse
  constante sur un circuit ; on mesure le **temps de contact** du point sur la cible.
- **Durée usuelle d'un essai : 2 minutes** (standard des épreuves prolongées de
  coordination psychomotrice en sélection).
- **Score** : pourcentage du temps passé sur la cible, converti en **classe (stanine)
  de 1 à 9**. Seuils usuels constatés dans la communauté des candidats pilotes
  (ex. retours sur le test psychomoteur type Pilotest/EPL) : **classe 8 à partir de
  78 %, classe 9 à partir de 82 %**. Les seuils sont modifiables dans l'interface.
- **Niveaux de difficulté** : vitesse de déplacement de la cible, largeur de la piste
  (tolérance) et complexité de la trajectoire.

> Les barèmes officiels des sélections ne sont pas publiés ; les valeurs ci-dessus sont
> les standards usuels rapportés publiquement. Tout est paramétrable dans l'app
> (vitesse, tolérance, durée, seuils de classe).

## Lancement

Web MIDI exige un **contexte sécurisé** : `localhost` convient.

```bash
cd ricochay-trainer
python3 -m http.server 8080
# ouvrir http://localhost:8080 dans Chrome ou Edge
```

- Navigateur : **Chrome/Edge** (Firefox : activer `dom.webmidi.enabled`).
- Autoriser l'accès MIDI quand le navigateur le demande.

## Branchement et apprentissage de l'APC mk2

1. Brancher l'APC mk2 en USB. Cliquer sur **« Reconnecter MIDI »** (la connexion est
   aussi tentée automatiquement au chargement).
2. Aller dans **« Apprendre / calibrer les boutons »**.
3. Cliquer sur **« Apprentissage auto (X puis Y) »** puis tourner deux boutons
   rotatifs : le premier devient la manivelle **X**, le second la manivelle **Y**.
   (Ou apprentissage manuel bouton par bouton.)
4. Cliquer sur **« Calibrer les butées »** et balayer chaque bouton rotatif sur toute
   sa course, puis terminer : la course complète du bouton couvre alors tout l'écran.
5. Options : inversion de X/Y, mode **position absolue** (potentiomètres de l'APC,
   réglage par défaut) ou **relatif** (encodeurs à impulsions), sensibilité.

Rappels de mapping usine de l'APC mini mk2 (canal 1) : pads = notes 0–63,
faders = CC 48–55 (+ master 56), boutons track/scene = notes 100–107 / 112–119.
Les encodeurs rotatifs étant réassignables, l'app les détecte par apprentissage ;
par défaut elle suppose CC 48 (X) et CC 49 (Y). Un **moniteur MIDI** affiche les
derniers messages reçus pour vérifier.

La configuration est persistée dans `localStorage`.

## Sans APC mk2

- **Clavier** : flèches (ou ZQSD/WASD) pour X/Y, `Entrée` = démarrer,
  `Espace` = pause, `Échap` = quitter.
- **Souris** : glisser directement le point sur le plateau.
- **Manivelles à l'écran** : case à cocher en haut de page (deux curseurs verticaux).

## Exercices et niveaux de difficulté

9 trajectoires : ligne horizontale, ligne verticale, diagonale, cercle, ellipse,
sinusoïde, carré (angles), huit (lemniscate), Lissajous 3:2. Les courbes ouvertes
sont parcourues en aller-retour ; les fermées en boucle.

Chaque exercice propose **3 niveaux** :

| Niveau | Vitesse cible | Tolérance | Durée |
|--------|---------------|-----------|-------|
| N1 Découverte | 80 px/s | 26 px | 60 s |
| N2 Confirmé | 140 px/s | 18 px | 90 s |
| N3 Expert | 210 px/s | 12 px | **120 s (2 min, standard)** |

## Scoring et historique

- Score = **% du temps avec le point dans la zone de tolérance autour de la cible**.
- Statistiques : sorties de piste (transitions hors zone), écart moyen/max à la cible.
- **Classe 1–9** via les seuils modifiables (défaut : 82/78/74/70/65/60/52/42 %).
- Historique local (`localStorage`, 500 essais), meilleur score affiché (★) par
  exercice/niveau, **export CSV**.

## Structure

```
index.html          page unique (menu, config, essai, résultat, historique)
css/style.css
js/logic.js         trajectoires, niveaux, simulation d'essai, classes (pur, testable)
js/midi.js          Web MIDI : connexion, MIDI learn, calibration, persistance
js/controls.js      manivelles -> point (MIDI, clavier, souris)
js/app.js           écrans, rendu canvas, boucle de jeu, historique, CSV
test/*.test.js      tests Node (aucun framework requis)
```

## Tests

```bash
node test/logic.test.js     # trajectoires, avance de la cible, scoring, classes
node test/midi.test.js      # apprentissage CC, calibration, modes position/relatif
node test/controls.test.js  # manivelles -> point, clavier, souris
```
