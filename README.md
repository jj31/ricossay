# ricossay

test de ricossay

---

# Entraîneur « Ricochay » — APC mk2

Application web d'entraînement à l'épreuve dite **de Ricochay** : deux manivelles
orthogonales (X horizontal, Y vertical) déplacent un point à l'écran, et le sujet
doit **parcourir le tracé sans en sortir** : le point **démarre au début de la
trajectoire** et chaque sortie de piste est détectée et comptabilisée.
L'essai **s'arrête dès l'arrivée** (extrémité du tracé, ou un tour complet pour les
circuits fermés). Un **bip** retentit quand le point touche le bord de la piste
(WebAudio, case « Son » en haut de page).

Les deux manivelles sont les **boutons rotatifs (encodeurs) d'un Akai APC mk2**,
connecté en USB et lu via l'**API Web MIDI** du navigateur. L'application prévoit
l'**apprentissage automatique des boutons** (MIDI learn) et la **calibration des
butées** : aucun réglage manuel de numéros de CC n'est nécessaire.

Aucune dépendance, aucun build : page statique en HTML/CSS/JS vanilla.

## Standards de l'épreuve (recherche effectuée)

- **Principe retenu ici** : le mobile part du début du circuit et doit le parcourir
  lui-même sans sortir de la piste ; on mesure le **temps passé sur la piste** et le
  **nombre de sorties** (détection de sortie de trajectoire). La variante classique de
  l'appareil à point moteur que l'on poursuit n'est pas retenue ici.
- **Durée usuelle d'un essai : 2 minutes** (standard des épreuves prolongées de
  coordination psychomotrice en sélection).
- **Score** : pourcentage du temps passé sur la piste, converti en **classe (stanine)
  de 1 à 9**. Seuils usuels constatés dans la communauté des candidats pilotes
  (ex. retours sur le test psychomoteur type Pilotest/EPL) : **classe 8 à partir de
  78 %, classe 9 à partir de 82 %**. Les seuils sont modifiables dans l'interface.
- **Niveaux de difficulté** : largeur de la piste (tolérance), durée de l'essai et
  complexité de la trajectoire.

> Les barèmes officiels des sélections ne sont pas publiés ; les valeurs ci-dessus sont
> les standards usuels rapportés publiquement. Tout est paramétrable dans l'app
> (tolérance, durée, seuils de classe).

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
5. Options : inversion de X/Y, mode **relatif — réglage par défaut** (encodeurs
   rotatifs infinis type MPK mini : **amplitude illimitée**, la manivelle virtuelle
   n'est pas bornée — seul le point est limité par les bords de l'écran ; gère les
   conventions 1/127, wrap absolu 127→0 et 65/63) ou **position absolue**
   (potentiomètres avec butées), et la sensibilité (gain du mode relatif).
6. **Pads de fonction** : trois boutons d'apprentissage assignent des pads
   (Note On) à **Démarrer**, **Recommencer** et **Quitter** sur l'écran d'essai :
   cliquez sur « Apprendre le pad… » puis appuyez sur le pad du contrôleur.

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

| Niveau | Tolérance (demi-largeur de piste) | Durée |
|--------|-------------------------------------|-------|
| N1 Découverte | 26 px | 60 s |
| N2 Confirmé | 18 px | 90 s |
| N3 Expert | 12 px | **120 s (2 min, standard)** |

## Scoring et historique

- Score = **% du temps avec le point dans la zone de tolérance autour du tracé** (la piste).
- Statistiques : sorties de piste (transitions hors zone), écart moyen/max à la piste,
  progression = % du tracé parcouru, temps mis et motif d'arrêt (**arrivée** ou **durée max**).
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
node test/logic.test.js     # trajectoires, point de départ, distance à la piste, arrêt à l'arrivée, scoring, classes
node test/midi.test.js      # apprentissage CC + pads, calibration, modes position/relatif, migration
node test/controls.test.js  # manivelles -> point, clavier, souris
```
