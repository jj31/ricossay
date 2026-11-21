(function () {
  'use strict';

  // État des deux "manivelles" virtuelles (0..1) et du point utilisateur
  // (coordonnées normalisées [-1, 1], y vers le haut).
  // Le point est ancré à une origine (départ du tracé) : les manivelles déplacent
  // le point relativement à cette origine, quelle que soit la position absolue
  // des boutons rotatifs.
  // Sources possibles : MIDI (MidiRig), clavier, souris, manivelles à l'écran.
  const Controls = {
    crankX: 0.5,
    crankY: 0.5,
    origin: { x: 0, y: 0 },          // position du point quand les manivelles sont à leur origine
    crankOrigin: { x: 0.5, y: 0.5 },  // valeurs des manivelles à l'ancrage
    invX: false,                     // inversion des axes (toutes sources : MIDI, BLE, clavier)
    invY: false,
    point: { x: 0, y: 0 },
    keySpeed: 0.6, // fraction de la plage par seconde avec les flèches
    keys: {},
    cb: {
      pause: function () {},
      start: function () {},
      stop: function () {},
    },

    init() {
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
        const k = e.key;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
        if (k === ' ') { if (!this.keys[' ']) this.cb.pause(); this.keys[' '] = true; return; }
        if (k === 'Enter') { this.cb.start(); return; }
        if (k === 'Escape') { this.cb.stop(); return; }
        this.keys[k] = true;
      });
      window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
    },

    // Ancre le point courant à la position (x, y) du tracé.
    anchor(x, y) {
      this.origin.x = x;
      this.origin.y = y;
      this.crankOrigin.x = this.crankX;
      this.crankOrigin.y = this.crankY;
      this.applyPoint();
    },

    setCrank(axis, v) {
      if (axis === 'x') this.crankX = v; else this.crankY = v;
      this.applyPoint();
    },

    // La souris (ou les manivelles à l'écran) positionne directement le point ;
    // l'origine des manivelles est réajustée pour rester cohérente.
    setPointDirect(x, y) {
      this.point.x = Math.min(1, Math.max(-1, x));
      this.point.y = Math.min(1, Math.max(-1, y));
      const sx = this.invX ? -1 : 1;
      const sy = this.invY ? -1 : 1;
      this.crankOrigin.x = this.crankX - (this.point.x - this.origin.x) / (2 * sx);
      this.crankOrigin.y = this.crankY - (this.point.y - this.origin.y) / (2 * sy);
    },

    applyPoint() {
      const sx = this.invX ? -1 : 1;
      const sy = this.invY ? -1 : 1;
      this.point.x = Math.min(1, Math.max(-1, this.origin.x + (this.crankX - this.crankOrigin.x) * 2 * sx));
      this.point.y = Math.min(1, Math.max(-1, this.origin.y + (this.crankY - this.crankOrigin.y) * 2 * sy));
    },

    update(dt) {
      let dx = 0, dy = 0;
      if (this.keys['ArrowLeft'] || this.keys['q'] || this.keys['a']) dx -= 1;
      if (this.keys['ArrowRight'] || this.keys['d']) dx += 1;
      if (this.keys['ArrowUp'] || this.keys['z'] || this.keys['w']) dy += 1;
      if (this.keys['ArrowDown'] || this.keys['s']) dy -= 1;
      if (dx || dy) {
        // Manivelles non bornées : seule la position du point est bornée (applyPoint).
        this.crankX = Math.max(-100, Math.min(100, this.crankX + dx * this.keySpeed * dt));
        this.crankY = Math.max(-100, Math.min(100, this.crankY + dy * this.keySpeed * dt));
        this.applyPoint();
      }
    },
  };

  window.Controls = Controls;
})();
