(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RicoLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // Niveaux de difficulté communs à tous les exercices.
  // vitesse en px/s, tolerance (rayon de la zone "sur la cible") en px, duree en secondes.
  // Niveau 3 = essai standard de 2 minutes.
  const NIVEAUX = [
    { id: 1, nom: 'Niveau 1 · Découverte', vitesse: 80,  tolerance: 26, duree: 60 },
    { id: 2, nom: 'Niveau 2 · Confirmé',   vitesse: 140, tolerance: 18, duree: 90 },
    { id: 3, nom: 'Niveau 3 · Expert',     vitesse: 210, tolerance: 12, duree: 120 },
  ];

  // Seuils de conversion du pourcentage de temps sur la cible en classe (stanine 1-9).
  // Valeurs usuelles constatées pour les épreuves de poursuite psychomotrices
  // (classe 8 >= 78 %, classe 9 >= 82 %). Modifiables dans l'interface.
  const SEUILS_CLASSE = [
    [82, 9], [78, 8], [74, 7], [70, 6], [65, 5],
    [60, 4], [52, 3], [42, 2], [0, 1],
  ];

  function courbeCarre(t) {
    const h = 0.7, e = 2 * h, per = 4 * e;
    let d = (((t % 1) + 1) % 1) * per;
    if (d < e) return [lerp(-h, h, d / e), -h];
    d -= e; if (d < e) return [h, lerp(-h, h, d / e)];
    d -= e; if (d < e) return [lerp(h, -h, d / e), h];
    d -= e; return [-h, lerp(h, -h, d / e)];
  }

  // Coordonnées normalisées : x et y dans [-1, 1], y vers le haut.
  const EXERCICES = [
    { id: 'ligne-h', nom: 'Ligne horizontale', desc: 'Suivi d\'une ligne droite horizontale.', fermee: false,
      courbe: (t) => [lerp(-0.85, 0.85, t), 0] },
    { id: 'ligne-v', nom: 'Ligne verticale', desc: 'Suivi d\'une ligne droite verticale.', fermee: false,
      courbe: (t) => [0, lerp(-0.8, 0.8, t)] },
    { id: 'diagonale', nom: 'Diagonale', desc: 'Coordination simultanée des deux manivelles.', fermee: false,
      courbe: (t) => [lerp(-0.7, 0.7, t), lerp(-0.7, 0.7, t)] },
    { id: 'cercle', nom: 'Cercle', desc: 'Trajectoire circulaire fermée.', fermee: true,
      courbe: (t) => [0.75 * Math.cos(TAU * t), 0.75 * Math.sin(TAU * t)] },
    { id: 'ellipse', nom: 'Ellipse', desc: 'Trajectoire elliptique, plus large que haute.', fermee: true,
      courbe: (t) => [0.85 * Math.cos(TAU * t), 0.55 * Math.sin(TAU * t)] },
    { id: 'sinusoide', nom: 'Sinusoïde', desc: 'Deux périodes de sinusoïde horizontale.', fermee: false,
      courbe: (t) => [lerp(-0.85, 0.85, t), 0.55 * Math.sin(TAU * 2 * t)] },
    { id: 'carre', nom: 'Carré', desc: 'Angles droits : changements de direction brusques.', fermee: true,
      courbe: courbeCarre },
    { id: 'huit', nom: 'Huit (lemniscate)', desc: 'Croisement au centre, inversion des deux axes.', fermee: true,
      courbe: (t) => {
        const th = TAU * t, den = 1 + Math.sin(th) * Math.sin(th);
        return [0.8 * Math.cos(th) / den, 0.8 * Math.sin(th) * Math.cos(th) / den];
      } },
    { id: 'lissajous', nom: 'Lissajous 3:2', desc: 'Courbe complexe à boucles multiples.', fermee: true,
      courbe: (t) => [0.8 * Math.sin(3 * TAU * t + Math.PI / 2), 0.7 * Math.sin(2 * TAU * t)] },
  ];

  // Échantillonne une courbe paramétrique et précalcule les longueurs d'arc.
  function echantillonner(fn, fermee, n) {
    n = n || 1600;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const p = fn(i / n);
      pts.push([p[0], p[1]]);
    }
    if (fermee) pts[n] = [pts[0][0], pts[0][1]];
    const cum = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }

  // Position sur la courbe à la distance d'arc s (unités normalisées).
  // Courbe fermée : bouclage. Courbe ouverte : aller-retour (ping-pong).
  function pointSurCourbe(c, s) {
    const L = c.total;
    if (c.pts.length < 2 || L <= 0) return [c.pts[0][0], c.pts[0][1]];
    if (!c.fermee) {
      const periode = 2 * L;
      let m = s % periode;
      if (m < 0) m += periode;
      s = m <= L ? m : periode - m;
    } else {
      s = ((s % L) + L) % L;
    }
    const cum = c.cum, pts = c.pts;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < s) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const s0 = cum[i - 1], s1 = cum[i];
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
  }

  function avancer(s, ds, L, fermee) {
    s += ds;
    if (fermee) return ((s % L) + L) % L;
    const periode = 2 * L;
    let m = s % periode;
    if (m < 0) m += periode;
    return m <= L ? m : periode - m;
  }

  // Simulation d'un essai : fait avancer la cible à vitesse constante le long de
  // la trajectoire et mesure le temps passé avec le point utilisateur dans la
  // zone de tolérance autour de la cible.
  class RunSim {
    constructor(opts) {
      this.exercice = opts.exercice;
      this.niveau = opts.niveau;
      this.echelle = opts.echelle; // px par unité normalisée
      this.courbe = echantillonner(this.exercice.courbe, this.exercice.fermee, 1600);
      this.courbe.fermee = this.exercice.fermee;
      this.L = this.courbe.total;
      this.vitesseN = this.niveau.vitesse / this.echelle;
      this.tolN = this.niveau.tolerance / this.echelle;
      this.duree = this.niveau.duree;
      this.reset();
    }
    reset() {
      this.s = 0;
      this.temps = 0;
      this.tempsSur = 0;
      this.sorties = 0;
      // Démarre "sur la cible" : un essai qui commence hors zone compte une sortie.
      this.dans = true;
      this.termine = false;
      this.sommeDist = 0;
      this.n = 0;
      this.maxDist = 0;
    }
    cible() { return pointSurCourbe(this.courbe, this.s); }
    update(dt, user) {
      if (this.termine) return;
      this.s = avancer(this.s, this.vitesseN * dt, this.L, this.exercice.fermee);
      this.temps += dt;
      const c = this.cible();
      const dPx = Math.hypot(user.x - c[0], user.y - c[1]) * this.echelle;
      const sur = dPx <= this.niveau.tolerance;
      if (sur) this.tempsSur += dt;
      else if (this.dans) this.sorties++;
      this.dans = sur;
      this.sommeDist += dPx;
      this.n++;
      if (dPx > this.maxDist) this.maxDist = dPx;
      if (this.temps >= this.duree) {
        this.temps = this.duree;
        this.termine = true;
      }
    }
    stats() {
      const pct = this.temps > 0 ? (100 * this.tempsSur) / this.temps : 0;
      return {
        temps: this.temps,
        duree: this.duree,
        tempsSur: this.tempsSur,
        pct,
        sorties: this.sorties,
        meanDistPx: this.n ? this.sommeDist / this.n : 0,
        maxDistPx: this.maxDist,
        termine: this.termine,
        dans: this.dans,
      };
    }
  }

  function classePour(pct, seuils) {
    const s = seuils || SEUILS_CLASSE;
    for (let i = 0; i < s.length; i++) {
      if (pct >= s[i][0]) return s[i][1];
    }
    return 1;
  }

  return {
    TAU, lerp, clamp,
    NIVEAUX, SEUILS_CLASSE, EXERCICES,
    echantillonner, pointSurCourbe, avancer,
    RunSim, classePour,
  };
});
