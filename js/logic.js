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
  // duree de l'essai en secondes (niveau 3 = essai standard de 2 minutes),
  // tolerance = demi-largeur de la piste en px : sortir de la piste = "sortie".
  const NIVEAUX = [
    { id: 1, nom: 'Niveau 1 · Découverte', tolerance: 26, duree: 60 },
    { id: 2, nom: 'Niveau 2 · Confirmé',   tolerance: 18, duree: 90 },
    { id: 3, nom: 'Niveau 3 · Expert',     tolerance: 12, duree: 120 },
  ];

  // Seuils de conversion du pourcentage de temps sur la piste en classe (stanine 1-9).
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

  // Spline de Catmull-Rom passant par les points de contrôle (courbe paramétrée t -> [x, y]).
  function catmullRom(pts) {
    return function (t) {
      const n = pts.length - 1;
      let i = Math.floor(t * n);
      if (i > n - 1) i = n - 1;
      const f = t * n - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
      const f2 = f * f, f3 = f2 * f;
      return [
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * f + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * f + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3),
      ];
    };
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
    { id: 'boucle', nom: 'Boucle ouverte (goutte)', desc: 'Boucle en goutte ouverte en bas à droite (d\'après image de référence).', fermee: false,
      courbe: catmullRom([
        [0.6, -0.6], [0.4, -0.2], [0.2, 0.2], [0.0, 0.6], [-0.2, 0.8], [-0.4, 0.6],
        [-0.6, 0.2], [-0.4, -0.2], [-0.2, -0.4], [0.0, -0.6], [0.2, -0.8], [0.4, -0.6],
      ]) },
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

  // Simulation d'un essai en mode "traçage" : le point utilisateur part du début
  // de la trajectoire et doit la parcourir sans sortir de la piste (bande de
  // tolérance autour de la courbe). On mesure le temps passé SUR la piste,
  // le nombre de sorties (transitions hors piste) et la progression parcourue.
  class RunSim {
    constructor(opts) {
      this.exercice = opts.exercice;
      this.niveau = opts.niveau;
      this.echelle = opts.echelle; // px par unité normalisée
      this.courbe = echantillonner(this.exercice.courbe, this.exercice.fermee, 1600);
      this.courbe.fermee = this.exercice.fermee;
      this.L = this.courbe.total;
      this.tolN = this.niveau.tolerance / this.echelle;
      this.duree = this.niveau.duree;
      this.start = pointSurCourbe(this.courbe, 0);
      this.reset();
    }
    reset() {
      this.temps = 0;
      this.tempsSur = 0;
      this.sorties = 0;
      // Démarre "sur la piste" : un essai qui commence hors piste compte une sortie.
      this.dans = true;
      this.termine = false;
      this.motif = null; // 'arrivee' | 'duree'
      this.sommeDist = 0;
      this.n = 0;
      this.maxDist = 0;
      this.dernierDistPx = 0;
      this.progression = 0;   // indice "déroulé" le long du circuit (unités d'échantillons)
      this.prevIndex = null;
      this.couvert = new Uint8Array(this.courbe.pts.length);
      this.couvertN = 0;
    }
    // Distance minimale (en px) entre le point et la trajectoire, avec l'indice
    // du point de la courbe le plus proche (utilisé pour la progression).
    distancePiste(x, y) {
      const pts = this.courbe.pts;
      let best = Infinity, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i][0], dy = y - pts[i][1];
        const d2 = dx * dx + dy * dy;
        if (d2 < best) { best = d2; bi = i; }
      }
      return { distPx: Math.sqrt(best) * this.echelle, index: bi };
    }
    update(dt, user) {
      if (this.termine) return;
      this.temps += dt;
      const d = this.distancePiste(user.x, user.y);
      this.dernierDistPx = d.distPx;
      // Progression : portions du tracé vues à moins de la tolérance.
      const tol2 = this.tolN * this.tolN;
      const pts = this.courbe.pts;
      for (let i = 0; i < pts.length; i++) {
        if (!this.couvert[i]) {
          const dx = user.x - pts[i][0], dy = user.y - pts[i][1];
          if (dx * dx + dy * dy <= tol2) { this.couvert[i] = 1; this.couvertN++; }
        }
      }
      const sur = d.distPx <= this.niveau.tolerance;
      if (sur) this.tempsSur += dt;
      else if (this.dans) this.sorties++;
      this.dans = sur;
      this.sommeDist += d.distPx;
      this.n++;
      if (d.distPx > this.maxDist) this.maxDist = d.distPx;
      if (this._arrivee(user, d.index)) {
        this.termine = true;
        this.motif = 'arrivee';
      } else if (this.temps >= this.duree) {
        this.temps = this.duree;
        this.termine = true;
        this.motif = 'duree';
      }
    }
    // Arrivée : extrémité du tracé (courbe ouverte), ou un tour complet pour les
    // circuits fermés. Pour les fermées, on accumule la progression "déroulée" :
    // un saut d'indice > la moitié de la longueur = passage par le bouclage.
    // Un retour en arrière ou une dérive hors piste ne déclenchent PAS l'arrivée.
    _arrivee(user, index) {
      const pts = this.courbe.pts;
      const len = pts.length;
      if (!this.exercice.fermee) {
        const fin = pts[len - 1];
        return Math.hypot(user.x - fin[0], user.y - fin[1]) * this.echelle <= this.niveau.tolerance;
      }
      if (this.prevIndex !== null) {
        // Seul un vrai passage par le bouclage (haut -> bas de l'échantillonnage)
        // ajoute un tour ; un retour en arrière ou une dérive ne comptent pas.
        if (this.prevIndex > len * 0.8 && index < len * 0.2) this.progression += len;
        else if (this.prevIndex < len * 0.2 && index > len * 0.8) this.progression -= len;
        else this.progression += index - this.prevIndex;
      }
      this.prevIndex = index;
      return this.progression >= len * 0.98;
    }
    stats() {
      const pct = this.temps > 0 ? Math.min(100, (100 * this.tempsSur) / this.temps) : 0;
      const couverturePct = (100 * this.couvertN) / this.courbe.pts.length;
      return {
        temps: this.temps,
        duree: this.duree,
        tempsSur: this.tempsSur,
        pct,
        sorties: this.sorties,
        meanDistPx: this.n ? this.sommeDist / this.n : 0,
        maxDistPx: this.maxDist,
        couverturePct,
        termine: this.termine,
        dans: this.dans,
        motif: this.motif,
        arrivee: this.motif === 'arrivee',
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
    echantillonner, pointSurCourbe,
    RunSim, classePour,
  };
});
