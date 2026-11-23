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
ok(L.EXERCICES.length === 12, '12 exercices définis (dont boucle image, chicane, circuit routier)');
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

console.log('Continuité des parcours (pas de saut entre segments ligne/arc)');
{
  let maxSaut = 0, idMax = '';
  for (const ex of L.EXERCICES) {
    const c = L.echantillonner(ex.courbe, ex.fermee, 2000);
    for (let i = 1; i < c.pts.length; i++) {
      const d = Math.hypot(c.pts[i][0] - c.pts[i - 1][0], c.pts[i][1] - c.pts[i - 1][1]);
      if (d > maxSaut) { maxSaut = d; idMax = ex.id; }
    }
  }
  ok(maxSaut < 0.05, 'saut max entre échantillons consecutifs < 0.05 pour tous les exercices (max=' + maxSaut.toFixed(4) + ' sur ' + idMax + ')');
}
{
  const chicane = L.EXERCICES.find((e) => e.id === 'chicane');
  const circuit = L.EXERCICES.find((e) => e.id === 'circuit');
  const cC = L.echantillonner(chicane.courbe, false, 2000);
  let maxY = 0, minY = 0;
  for (const p of cC.pts) { maxY = Math.max(maxY, p[1]); minY = Math.min(minY, p[1]); }
  ok(Math.abs(maxY - 0.3) < 0.02 && Math.abs(minY + 0.3) < 0.02, 'chicane : demi-cercles de rayon 0.3 (y max=' + maxY.toFixed(2) + ', min=' + minY.toFixed(2) + ')');
  const cR = L.echantillonner(circuit.courbe, false, 2000);
  let aQuart = false;
  for (const p of cR.pts) {
    const d = Math.hypot(p[0] - 0.3, p[1] + 0.4); // distance au centre du 1er quart de cercle
    if (Math.abs(d - 0.3) < 0.02) { aQuart = true; break; }
  }
  ok(aQuart, 'circuit : contient bien un quart de cercle de rayon 0.3 autour de (0.3, -0.4)');
  const p0 = L.pointSurCourbe(cR, 0), p1 = L.pointSurCourbe(cR, cR.total);
  ok(Math.abs(p0[0] + 0.8) < 0.01 && Math.abs(p0[1] + 0.7) < 0.01, 'circuit : départ en (-0.8, -0.7)');
  ok(Math.abs(p1[0] - 0.7) < 0.01 && Math.abs(p1[1] - 0.2) < 0.01, 'circuit : arrivée en (0.7, 0.2)');
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
    const s = sim.L * 0.4 * Math.min(1, t / niv.duree); // 40 % du tour : pas d'arrivée
    const p = L.pointSurCourbe(sim.courbe, s);
    sim.update(dt, { x: p[0], y: p[1] });
    t += dt;
  }
  const st = sim.stats();
  ok(sim.termine && st.motif === 'duree', 'essai allé jusqu\'à la durée prévue (motif=' + st.motif + ')');
  ok(Math.abs(st.pct - 100) < 1e-9, 'tracé parfait => 100 % du temps sur la piste (' + st.pct + ')');
  ok(st.sorties === 0, 'aucune sortie');
  ok(st.couverturePct > 35 && st.couverturePct < 45, 'progression ~40 % du tracé parcouru (' + st.couverturePct.toFixed(1) + ' %)');
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

console.log('Arrivée : arrêt à l\'extrémité du tracé (courbe ouverte)');
{
  const ex = L.EXERCICES.find((e) => e.id === 'ligne-h');
  const niv = L.NIVEAUX[0]; // 60 s, tol 26 px
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const x = Math.min(0.85, -0.85 + 1.7 * (t / 10)); // atteint l'extrémité (0.85, 0) en 10 s
    sim.update(dt, { x, y: 0 });
    t += dt;
  }
  const st = sim.stats();
  ok(sim.termine && st.motif === 'arrivee' && st.arrivee, 'essai arrêté à l\'arrivée (motif=' + st.motif + ')');
  ok(st.temps > 8 && st.temps < 11 && st.temps < niv.duree, 'arrêt à l\'arrivée (~10 s, dès qu\'on est à tolérance de l\'extrémité), bien avant les 60 s (temps=' + st.temps.toFixed(2) + ')');
  ok(Math.abs(st.pct - 100) < 1e-9 && st.sorties === 0, 'tracé sur la piste pendant tout le trajet => 100 %, 0 sortie');
}

console.log('Arrivée : un tour complet (courbe fermée)');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[0];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) {
    const s = Math.min(sim.L, sim.L * (t / 8)); // un tour en 8 s
    const p = L.pointSurCourbe(sim.courbe, s);
    sim.update(dt, { x: p[0], y: p[1] });
    t += dt;
  }
  const st = sim.stats();
  ok(sim.termine && st.motif === 'arrivee', 'essai arrêté après le tour complet (motif=' + st.motif + ', temps=' + st.temps.toFixed(2) + ' s)');
  ok(st.couverturePct > 90, 'progression ~100 % du tour (' + st.couverturePct.toFixed(1) + ' %)');
}

console.log('Pas de fausse arrivée : retour en arrière sur circuit fermé');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[0]; // 60 s
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  const aller = (s0, s1, duree) => {
    const steps = Math.round(duree / dt);
    for (let k = 1; k <= steps && !sim.termine; k++) {
      const s = s0 + (s1 - s0) * (k / steps);
      const p = L.pointSurCourbe(sim.courbe, s);
      sim.update(dt, { x: p[0], y: p[1] });
    }
  };
  aller(0, sim.L * 0.6, 6);   // 60 % du tour en avant
  aller(sim.L * 0.6, 0, 6);   // retour au départ (pas un tour complet)
  ok(!sim.termine, 'après 60 % + retour au départ : pas d\'arrivée (termine=' + sim.termine + ')');
  aller(0, sim.L, 10);        // maintenant le tour complet
  const st = sim.stats();
  ok(sim.termine && st.motif === 'arrivee', 'arrivée seulement après le tour complet (motif=' + st.motif + ')');
}

console.log('Pas de fausse arrivée : dérive hors piste au milieu du circuit');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[0];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  const suivre = (s, duree) => {
    const steps = Math.round(duree / dt);
    for (let k = 1; k <= steps && !sim.termine; k++) {
      const p = L.pointSurCourbe(sim.courbe, s + (sim.L * 0.6) * (k / steps));
      sim.update(dt, { x: p[0], y: p[1] });
    }
  };
  suivre(0, 6); // 60 % du tour
  // dérive au centre (hors piste, indice le plus proche quelconque)
  for (let k = 0; k < 600 && !sim.termine; k++) sim.update(dt, { x: 0, y: 0 });
  ok(!sim.termine, 'dérive au centre après 60 % : pas d\'arrivée (termine=' + sim.termine + ', progression=' + sim.progression.toFixed(0) + ')');
}

console.log('Nouvel exercice "boucle" (image de référence)');
{
  const ex = L.EXERCICES.find((e) => e.id === 'boucle');
  ok(!!ex && ex.fermee === false, 'exercice boucle présent, courbe ouverte');
  const c = L.echantillonner(ex.courbe, false, 800);
  const p0 = L.pointSurCourbe(c, 0), p1 = L.pointSurCourbe(c, c.total);
  ok(Math.abs(p0[0] - 0.6) < 0.05 && Math.abs(p0[1] + 0.6) < 0.05, 'départ en bas à droite (~0.6, -0.6)');
  ok(Math.abs(p1[0] - 0.4) < 0.05 && Math.abs(p1[1] + 0.6) < 0.05, 'arrivée près du départ (~0.4, -0.6), écart ~54 px > tol N1');
  ok(Math.abs(p0[0] - p1[0]) * 270 > L.NIVEAUX[0].tolerance, 'pas de fausse arrivée au départ (écart départ/arrivée > tolérance N1)');
}

console.log('Sans arrivée : l\'essai va jusqu\'à la durée max');
{
  const ex = L.EXERCICES.find((e) => e.id === 'cercle');
  const niv = L.NIVEAUX[0];
  const sim = new L.RunSim({ exercice: ex, niveau: niv, echelle: 270 });
  const dt = 1 / 60;
  let t = 0;
  while (!sim.termine && t < niv.duree + 1) { sim.update(dt, { x: sim.start[0], y: sim.start[1] }); t += dt; }
  const st = sim.stats();
  ok(sim.termine && st.motif === 'duree' && !st.arrivee, 'motif=duree, temps = ' + st.temps.toFixed(1) + ' s');
  ok(st.pct === 100 && st.sorties === 0, 'point immobile sur la piste : 100 % plafonné, 0 sortie (pct=' + st.pct + ')');
}

console.log('Classes (stanines)');
ok(L.classePour(100) === 9 && L.classePour(82) === 9, 'classe 9 à partir de 82 %');
ok(L.classePour(78) === 8 && L.classePour(81.9) === 8, 'classe 8 à partir de 78 %');
ok(L.classePour(69) === 5, '69 % => classe 5 avec les seuils par défaut (cohérent avec les seuils constatés 78 %/82 %)');
ok(L.classePour(0) === 1 && L.classePour(41.9) === 1, 'classe 1 en dessous de 42 %');
ok(L.classePour(50, [[50, 5], [0, 1]]) === 5, 'seuils personnalisés pris en compte');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
