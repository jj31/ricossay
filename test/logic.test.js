'use strict';
// Tests unitaires du module logique (trajectoires, niveaux, scoring).
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
for (const ex of L.EXERCICES) {
  const c = L.echantillonner(ex.courbe, ex.fermee, 800);
  let dansBornes = true;
  for (const p of c.pts) {
    if (Math.abs(p[0]) > 1.001 || Math.abs(p[1]) > 1.001) dansBornes = false;
  }
  ok(dansBornes && c.total > 0.5, ex.id + ' : points dans [-1,1] et longueur > 0 (' + c.total.toFixed(2) + ')');
}

console.log('Position le long des courbes (longueur d\'arc)');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const c = L.echantillonner(ex.courbe, true, 2000);
  const p0 = L.pointSurCourbe(c, 0);
  const pQ = L.pointSurCourbe(c, c.total / 4);
  ok(Math.abs(p0[0] - 0.75) < 1e-6 && Math.abs(p0[1]) < 1e-6, 'cercle : départ en (0.75, 0)');
  ok(Math.abs(pQ[0]) < 1e-6 && Math.abs(pQ[1] - 0.75) < 1e-6, 'cercle : quart de tour en (0, 0.75)');
  const pLoop = L.pointSurCourbe(c, c.total * 1.5);
  const pHalf = L.pointSurCourbe(c, c.total / 2);
  ok(Math.hypot(pLoop[0] - pHalf[0], pLoop[1] - pHalf[1]) < 1e-9, 'courbe fermée : rebouclage après un tour complet');
}
{
  const ex = L.EXERCICES.find((e) => e.id === 'ligne-h');
  const c = L.echantillonner(ex.courbe, false, 100);
  const pFin = L.pointSurCourbe(c, c.total);
  const pRetour = L.pointSurCourbe(c, c.total * 1.5);
  ok(Math.abs(pFin[0] - 0.85) < 1e-9, 'ligne : fin au bout droit');
  ok(Math.abs(pRetour[0] - 0) < 0.05 && Math.abs(pRetour[1]) < 1e-9, 'courbe ouverte : aller-retour (mi-retour au centre)');
}

console.log('Avancer (ping-pong)');
ok(Math.abs(L.avancer(0, 5, 10, true) - 5) < 1e-12, 'fermée : avance simple');
ok(Math.abs(L.avancer(8, 5, 10, true) - 3) < 1e-12, 'fermée : modulo longueur');
ok(Math.abs(L.avancer(8, 5, 10, false) - 7) < 1e-12, 'ouverte : retour après le bout (15 -> 7)');

console.log('RunSim : poursuite parfaite');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[1];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 120;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const c = sim.cible();
    sim.update(dt, { x: c[0], y: c[1] });
    t += dt;
  }
  const st = sim.stats();
  ok(sim.termine, 'essai terminé après la durée prévue');
  ok(Math.abs(st.pct - 100) < 1e-9, 'poursuite parfaite => 100 % (' + st.pct + ')');
  ok(st.sorties === 0, 'aucune sortie');
  ok(Math.abs(st.temps - niv.duree) < 1e-6, 'durée mesurée = durée configurée');
}

console.log('RunSim : point immobile loin de la cible');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[1];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) { sim.update(dt, { x: 0, y: 0 }); t += dt; }
  const st = sim.stats();
  ok(st.pct === 0, 'point au centre d\'un cercle de rayon 0.75*270 px => 0 % (tolérance ' + niv.tolerance + ' px)');
  ok(st.sorties >= 1, 'au moins une sortie comptabilisée (' + st.sorties + ')');
  ok(st.maxDistPx > niv.tolerance, 'écart max > tolérance');
}

console.log('RunSim : sorties comptabilisées aux transitions');
{
  const ex = L.EXERCICES.find((e) => e.id === 'ligne-h');
  const niv = L.NIVEAUX[0];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  // alterne sur/hors cible toutes les 0.5 s en restant sur la ligne
  let t = 0, phase = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const c = sim.cible();
    const decalage = (phase % 2 === 0) ? 0 : 0.5; // hors tolérance (26 px = 0.096 unité)
    sim.update(dt, { x: c[0] + decalage, y: c[1] });
    t += dt;
    if (Math.floor(t / 0.5) !== Math.floor((t - dt) / 0.5)) phase++;
  }
  const st = sim.stats();
  ok(st.sorties >= 10, 'sorties comptées à chaque sortie de zone (' + st.sorties + ')');
  ok(st.pct > 30 && st.pct < 70, 'environ 50 % sur la cible (' + st.pct.toFixed(1) + ' %)');
}

console.log('Classes (stanines)');
ok(L.classePour(100) === 9 && L.classePour(82) === 9, 'classe 9 à partir de 82 %');
ok(L.classePour(78) === 8 && L.classePour(81.9) === 8, 'classe 8 à partir de 78 %');
ok(L.classePour(69) === 5, '69 % => classe 5 avec les seuils par défaut (cohérent avec les seuils constatés 78 %/82 %)');
ok(L.classePour(0) === 1 && L.classePour(41.9) === 1, 'classe 1 en dessous de 42 %');
ok(L.classePour(50, [[50, 5], [0, 1]]) === 5, 'seuils personnalisés pris en compte');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
