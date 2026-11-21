(function () {
  'use strict';

  const LS_KEY = 'ricochay.config.v1';

  // APC mini / APC40 mk2 : les encodeurs rotatifs envoient des CC absolus (0-127).
  // Par défaut on suppose les deux premiers boutons rotatifs (CC 48 et 49) ;
  // le mode apprentissage permet de les réassigner automatiquement.
  const DEFAULTS = {
    inputName: '',
    ccX: 48, ccY: 49,
    minX: 0, maxX: 127,
    minY: 0, maxY: 127,
    invX: false, invY: false,
    // Encodeurs rotatifs infinis (MPK mini / APC) : mode relatif par défaut,
    // sans butées. 'position' ne sert que pour des potentiomètres avec butées.
    mode: 'relatif',
    modeExplicite: true,   // false tant que l'utilisateur n'a pas choisi le mode
    sensibilite: 1.5,      // gain du mode relatif
  };

  const MidiRig = {
    supported: typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function',
    access: null,
    input: null,
    inputs: [],
    config: Object.assign({}, DEFAULTS),
    learn: null,            // null | 'x' | 'y' | 'auto'
    autoState: null,        // 'attenteX' | 'attenteY'
    calib: null,            // { x: {min,max}, y: {min,max} } pendant la calibration
    last: { x: null, y: null },
    crank: { x: 0.5, y: 0.5 },
    cb: {
      crank: function () {},   // (axis 'x'|'y', valeur normalisée 0..1)
      raw: function () {},     // (description texte du message MIDI brut)
      status: function () {},  // (texte de statut)
      mapping: function () {}, // la config a changé
    },

    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.config = Object.assign({}, DEFAULTS, parsed);
          // Migration : une ancienne config (avant le choix explicite du mode)
          // passait en mode relatif, sans butées, en conservant les CC appris.
          if (!('modeExplicite' in parsed)) {
            this.config.mode = 'relatif';
            this.config.modeExplicite = true;
            this.save();
          }
        }
      } catch (e) { /* config corrompue : on repart des défauts */ }
    },
    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.config)); } catch (e) {}
      this.cb.mapping(this.config);
    },
    reset() {
      this.config = Object.assign({}, DEFAULTS);
      this.save();
    },

    async connect() {
      if (!this.supported) {
        this.cb.status('Web MIDI non disponible : utilisez Chrome/Edge et une page en localhost ou HTTPS.');
        return false;
      }
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false });
      } catch (e) {
        this.cb.status('Accès MIDI refusé par le navigateur.');
        return false;
      }
      this.access.onstatechange = () => this.refreshInputs();
      this.refreshInputs();
      return true;
    },

    refreshInputs() {
      this.inputs = [];
      if (!this.access) return;
      this.access.inputs.forEach((input) => this.inputs.push(input));
      let chosen = null;
      if (this.config.inputName) {
        chosen = this.inputs.find((i) => i.name === this.config.inputName) || null;
      }
      if (!chosen) {
        chosen = this.inputs.find((i) => /apc/i.test(i.name || '')) || this.inputs[0] || null;
      }
      this.setInput(chosen);
    },

    setInput(input) {
      if (this.input && this.input.onmidimessage) this.input.onmidimessage = null;
      this.input = input;
      if (input) {
        this.config.inputName = input.name || '';
        input.onmidimessage = (e) => this.handleMessage(e);
        this.cb.status('Connecté : ' + (input.name || 'entrée MIDI') + ' (' + input.type + ')');
      } else {
        this.cb.status('Aucune entrée MIDI détectée. Branchez l\'APC mk2 en USB puis cliquez sur « Reconnecter MIDI ».');
      }
      this.save();
    },

    setLearn(target) {
      this.learn = target;
      if (target === 'auto') this.autoState = 'attenteX';
      this.cb.mapping(this.config);
    },

    startCalib() {
      this.calib = { x: { min: 127, max: 0 }, y: { min: 127, max: 0 } };
      this.cb.mapping(this.config);
    },
    stopCalib() {
      if (this.calib) {
        for (const axis of ['x', 'y']) {
          const c = this.calib[axis];
          if (c.max > c.min) {
            this.config['min' + axis.toUpperCase()] = c.min;
            this.config['max' + axis.toUpperCase()] = c.max;
          }
        }
        if (this.config.maxX <= this.config.minX) { this.config.minX = 0; this.config.maxX = 127; }
        if (this.config.maxY <= this.config.minY) { this.config.minY = 0; this.config.maxY = 127; }
      }
      this.calib = null;
      this.save();
    },

    axisPourCC(cc) {
      if (cc === this.config.ccX) return 'x';
      if (cc === this.config.ccY) return 'y';
      return null;
    },

    handleMessage(e) {
      const d = e.data;
      if (!d || d.length < 3) return;
      const status = d[0], d1 = d[1], d2 = d[2];
      const type = status & 0xF0;
      if (type === 0xB0) {
        const cc = d1, val = d2;
        this.cb.raw('CC' + cc + ' = ' + val + ' (canal ' + ((status & 0x0F) + 1) + ')');

        if (this.learn) {
          if (this.learn === 'x') { this.config.ccX = cc; this.learn = null; }
          else if (this.learn === 'y') { this.config.ccY = cc; this.learn = null; }
          else if (this.learn === 'auto') {
            if (this.autoState === 'attenteX') {
              this.config.ccX = cc;
              this.autoState = 'attenteY';
            } else if (cc !== this.config.ccX) {
              this.config.ccY = cc;
              this.learn = null;
              this.autoState = null;
            }
          }
          this.last.x = null; this.last.y = null;
          this.save();
          return;
        }

        const axis = this.axisPourCC(cc);
        if (!axis) return;

        if (this.calib) {
          const c = this.calib[axis];
          if (val < c.min) c.min = val;
          if (val > c.max) c.max = val;
          this.cb.mapping(this.config);
        }

        if (this.config.mode === 'relatif') {
          const prev = this.last[axis];
          let delta = prev === null ? 0 : val - prev;
          if (delta > 64) delta -= 128;
          else if (delta < -64) delta += 128;
          this.last[axis] = val;
          this.crank[axis] = Math.min(1, Math.max(0, this.crank[axis] + delta * 0.008 * this.config.sensibilite));
          this.cb.crank(axis, this.crank[axis]);
        } else {
          this.last[axis] = val;
          const min = this.config['min' + axis.toUpperCase()];
          const max = this.config['max' + axis.toUpperCase()];
          let norm = max > min ? (val - min) / (max - min) : val / 127;
          norm = Math.min(1, Math.max(0, norm));
          if (this.config['inv' + axis.toUpperCase()]) norm = 1 - norm;
          this.crank[axis] = norm;
          this.cb.crank(axis, norm);
        }
      } else if (type === 0x90 || type === 0x80) {
        this.cb.raw('Note ' + d1 + ' ' + (type === 0x90 ? 'on' : 'off') + ' vel ' + d2);
      }
    },
  };

  MidiRig.load();
  window.MidiRig = MidiRig;
})();
