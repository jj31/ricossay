'use strict';
// Tests unitaires du module logique (trajectoires, mode traçage, scoring).
// Lancement : node test/logic.test.js
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'logic.js'));

let echecs = 0;
function ok(cond, msg) {
  if (cond) { console.log('  OK  ' + msg); }
  else { echecs++; console.error('  ECHEC  ' + msg); }
}

console.log('Exercices et niveaux');
ok(L.EXERCICES.length === 9, '9 exercices définis');
ok(L.NIVEAUX.length === 3, '3 niveaux de difficulté');
ok(L.NIVEAUX[2].duree === 120, 'niveau 3 = essai standard de 2 minutes (120 s)');
ok(L.NIVEAUX[0].tolerance > L.NIVEAUX[1].tolerance && L.NIVEAUX[1].tolerance > L.NIVEAUX[2].tolerance,
  'tolérance décroissante avec le niveau (' + L.NIVEAUX.map((n) => n.tolerance).join('/') + ' px)');
for (const ex of L.EXERCICES) {
  const c = L.echantillonner(ex.courbe, ex.fermee, 800);
  let dansBornes = true;
  for (const p of c.pts) {
    if (Math.abs(p[0]) > 1.001 || Math.abs(p[1]) > 1.001) dansBornes = false;
  }
  ok(dansBornes && c.total > 0.5, ex.id + ' : points dans [-1,1] et longueur > 0 (' + c.total.toFixed(2) + ')');
}

console.log('Point de départ et parcours de courbe');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const c = L.echantillonner(ex.courbe, true, 2000);
  const sim = new L.RunSim({ exercice: ex, niveau: L.NIVEAUX[0], echelle: 270 });
  ok(Math.abs(sim.start[0] - 0.75) < 1e-6 && Math.abs(sim.start[1]) < 1e-6,
    'le mobile démarre au début de la trajectoire (cercle : (0.75, 0))');
  const pQ = L.pointSurCourbe(c, c.total / 4);
  ok(Math.abs(pQ[0]) < 1e-6 && Math.abs(pQ[1] - 0.75) < 1e-6, 'quart de tour en (0, 0.75)');
  const pLoop = L.pointSurCourbe(c, c.total * 1.5);
  const pHalf = L.pointSurCourbe(c, c.total / 2);
  ok(Math.hypot(pLoop[0] - pHalf[0], pLoop[1] - pHalf[1]) < 1e-9, 'courbe fermée : rebouclage après un tour');
  const exL = L.EXERCICES.find((e) => e.id === 'ligne-h');
  const cL = L.echantillonner(exL.courbe, false, 100);
  ok(Math.abs(L.pointSurCourbe(cL, cL.total)[0] - 0.85) < 1e-9, 'ligne : extrémité au bout droit');
  const pR = L.pointSurCourbe(cL, cL.total * 1.5);
  ok(Math.abs(pR[0]) < 0.05, 'courbe ouverte : aller-retour (mi-retour au centre)');
}

console.log('distancePiste');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const sim = new L.RunSim({ exercice: ex, niveau: L.NIVEAUX[0], echelle: 270 });
  ok(sim.distancePiste(0.75, 0).distPx < 1e-6, 'point sur la courbe -> distance 0');
  const d = sim.distancePiste(0, 0).distPx;
  ok(Math.abs(d - 0.75 * 270) < 1, 'centre du cercle -> distance = rayon (' + d.toFixed(1) + ' px)');
}

console.log('RunSim : tracé parfait');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[1];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 120;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const s = sim.L * Math.min(1, t / niv.duree); // un tour complet sur la durée
    const p = L.pointSurCourbe(sim.courbe, s);
    sim.update(dt, { x: p[0], y: p[1] });
    t += dt;
  }
  const st = sim.stats();
  ok(sim.termine, 'essai terminé après la durée prévue');
  ok(Math.abs(st.pct - 100) < 1e-9, 'tracé parfait => 100 % du temps sur la piste (' + st.pct + ')');
  ok(st.sorties === 0, 'aucune sortie');
  ok(st.couverturePct > 95, 'progression ~100 % du tracé parcouru (' + st.couverturePct.toFixed(1) + ' %)');
  ok(Math.abs(st.temps - niv.duree) < 1e-6, 'durée mesurée = durée configurée');
}

console.log('RunSim : point immobile hors de la piste');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[1];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) { sim.update(dt, { x: 0, y: 0 }); t += dt; }
  const st = sim.stats();
  ok(st.pct === 0, 'jamais sur la piste => 0 % (tolérance ' + niv.tolerance + ' px, écart ' + st.maxDistPx.toFixed(0) + ' px)');
  ok(st.sorties === 1, 'départ hors piste = 1 sortie comptabilisée');
  ok(Math.abs(st.maxDistPx - 0.75 * 270) < 1, 'écart max = rayon du cercle');
}

console.log('RunSim : sorties comptabilisées aux transitions hors piste');
{
  const ex = L.EXERCICES.find((e) => e.id === 'ligne-h');
  const niv = L.NIVEAUX[0];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0, phase = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const x = -0.85 + 1.7 * (t / niv.duree);
    const y = (phase % 2 === 0) ? 0 : 0.3; // 0.3*270 = 81 px > tolérance 26 px
    sim.update(dt, { x, y });
    t += dt;
    if (Math.floor(t / 0.5) !== Math.floor((t - dt) / 0.5)) phase++;
  }
  const st = sim.stats();
  ok(st.sorties >= 10, 'sortie détectée à chaque passage hors piste (' + st.sorties + ')');
  ok(st.pct > 30 && st.pct < 70, 'environ 50 % du temps sur la piste (' + st.pct.toFixed(1) + ' %)');
}

console.log('Classes (stanines)');
ok(L.classePour(100) === 9 && L.classePour(82) === 9, 'classe 9 à partir de 82 %');
ok(L.classePour(78) === 8 && L.classePour(81.9) === 8, 'classe 8 à partir de 78 %');
ok(L.classePour(69) === 5, '69 % => classe 5 avec les seuils par défaut (cohérent avec les seuils constatés 78 %/82 %)');
ok(L.classePour(0) === 1 && L.classePour(41.9) === 1, 'classe 1 en dessous de 42 %');
ok(L.classePour(50, [[50, 5], [0, 1]]) === 5, 'seuils personnalisés pris en compte');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
