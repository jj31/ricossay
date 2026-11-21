(function () {
  'use strict';

  const L = window.RicoLogic;
  const MidiRig = window.MidiRig;
  const BleRig = window.BleRig;
  const Controls = window.Controls;

  const LS_HISTORY = 'ricochay.history.v1';
  const LS_SEUILS = 'ricochay.seuils.v1';

  const W = 1040, H = 680, MARGIN = 70;
  const CX = W / 2, CY = H / 2;
  const ECHELLE = Math.min((W - 2 * MARGIN) / 2, (H - 2 * MARGIN) / 2);

  const $ = (id) => document.getElementById(id);

  const state = {
    screen: 'menu',
    sim: null,
    current: null,
    run: null,
    seuils: null,
    history: [],
    showVirtualCranks: false,
    dragging: false,
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  state.seuils = loadJSON(LS_SEUILS, L.SEUILS_CLASSE.map((s) => s.slice()));
  state.history = loadJSON(LS_HISTORY, []);

  function toPx(x, y) { return [CX + x * ECHELLE, CY - y * ECHELLE]; }
  function toNorm(px, py) { return [(px - CX) / ECHELLE, -(py - CY) / ECHELLE]; }

  // Bips WebAudio (aucun fichier son) : bord de la piste + sortie de piste.
  const Son = {
    ctx: null,
    actif: true,
    dernierBord: -1,
    init() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    bip(freq, duree, type, vol, minInterval) {
      if (!this.actif || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (minInterval && now - this.dernierBord < minInterval) return;
      if (minInterval) this.dernierBord = now;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.06, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duree);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(now);
      o.stop(now + duree + 0.02);
    },
  };

  // ---------- navigation ----------
  function show(screen) {
    state.screen = screen;
    for (const s of ['menu', 'setup', 'run', 'result', 'history']) {
      $('screen-' + s).classList.toggle('hidden', s !== screen);
    }
    if (screen === 'menu') buildMenu();
    if (screen === 'history') buildHistory();
    if (screen === 'setup') { renderMappingInfo(); renderSeuilsEditor(); }
  }

  // ---------- menu ----------
  function bestFor(exId, nivId) {
    let best = null;
    for (const h of state.history) {
      if (h.ex === exId && h.niveau === nivId) {
        if (best === null || h.pct > best) best = h.pct;
      }
    }
    return best;
  }

  function buildMenu() {
    const grid = $('exercise-grid');
    grid.innerHTML = '';
    for (const ex of L.EXERCICES) {
      const card = document.createElement('div');
      card.className = 'card';
      const h = document.createElement('h3');
      h.textContent = ex.nom;
      const p = document.createElement('p');
      p.textContent = ex.desc;
      const levels = document.createElement('div');
      levels.className = 'levels';
      for (const niv of L.NIVEAUX) {
        const b = document.createElement('button');
        b.className = 'btn level-n' + niv.id;
        const best = bestFor(ex.id, niv.id);
        b.textContent = 'N' + niv.id + ' · ' + niv.duree + ' s · tol ' + niv.tolerance + ' px' +
          (best !== null ? '  ★ ' + best.toFixed(1) + ' %' : '');
        b.title = niv.nom;
        b.addEventListener('click', () => startRun(ex, niv));
        levels.appendChild(b);
      }
      card.appendChild(h); card.appendChild(p); card.appendChild(levels);
      grid.appendChild(card);
    }
  }

  // ---------- écran configuration (apprentissage MIDI) ----------
  function renderMappingInfo() {
    const c = MidiRig.config;
    $('mapping-info').innerHTML =
      '<li>Entrée MIDI : <strong>' + (c.inputName || 'aucune') + '</strong></li>' +
      '<li>Manivelle <strong>X</strong> (horizontal) : CC <strong>' + c.ccX + '</strong> · butées ' + c.minX + '–' + c.maxX +
      ' · ' + (c.invX ? 'inversée' : 'normale') + '</li>' +
      '<li>Manivelle <strong>Y</strong> (vertical) : CC <strong>' + c.ccY + '</strong> · butées ' + c.minY + '–' + c.maxY +
      ' · ' + (c.invY ? 'inversée' : 'normale') + '</li>' +
      '<li>Mode : <strong>' + (c.mode === 'position' ? 'position absolue (potentiomètre, avec butées)' : 'relatif (encodeurs infinis, sans butées)') + '</strong>' +
      (MidiRig.calib ? ' · <strong>calibration en cours…</strong> balayez chaque bouton sur toute sa course' : '') + '</li>' +
      '<li>Pads : Démarrer = <strong>' + (c.padStart === null ? 'non assigné' : 'note ' + c.padStart) + '</strong> · ' +
      'Recommencer = <strong>' + (c.padRestart === null ? 'non assigné' : 'note ' + c.padRestart) + '</strong> · ' +
      'Quitter = <strong>' + (c.padQuit === null ? 'non assigné' : 'note ' + c.padQuit) + '</strong></li>';
    const lx = $('btn-learn-x'), ly = $('btn-learn-y'), la = $('btn-learn-auto');
    if (MidiRig.learn === 'x') lx.textContent = '… tournez une manivelle pour X';
    else lx.textContent = 'Apprendre la manivelle X';
    if (MidiRig.learn === 'y') ly.textContent = '… tournez une manivelle pour Y';
    else ly.textContent = 'Apprendre la manivelle Y';
    if (MidiRig.learn === 'auto') la.textContent = '… 1ʳᵉ manivelle = X, 2ᵉ = Y';
    else la.textContent = 'Apprentissage auto (X puis Y)';
    $('btn-calib').textContent = MidiRig.calib ? 'Terminer la calibration des butées' : 'Calibrer les butées (balayer X et Y)';
    const pads = [['btn-pad-start', 'start', 'Démarrer'], ['btn-pad-restart', 'restart', 'Recommencer'], ['btn-pad-quit', 'quit', 'Quitter']];
    for (const [id, key, label] of pads) {
      $(id).textContent = MidiRig.learnPad === key
        ? '… appuyez sur un pad pour « ' + label + ' »'
        : 'Apprendre le pad « ' + label + ' »';
    }
    $('opt-mode').value = c.mode;
    $('opt-invx').checked = c.invX;
    $('opt-invy').checked = c.invY;
    $('opt-sens').value = c.sensibilite;
    $('opt-sens-val').textContent = Number(c.sensibilite).toFixed(2);
    $('opt-sens-ble').value = BleRig.sens;
    $('opt-sens-ble-val').textContent = BleRig.sens.toFixed(2);
  }

  function renderSeuilsEditor() {
    const box = $('seuils-editor');
    box.innerHTML = '';
    const sorted = state.seuils.slice().sort((a, b) => b[0] - a[0]);
    for (const [min, classe] of sorted) {
      const label = document.createElement('label');
      label.className = 'seuil-item';
      const input = document.createElement('input');
      input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = min;
      input.addEventListener('change', () => {
        const v = Math.min(100, Math.max(0, Number(input.value) || 0));
        const found = state.seuils.find((s) => s[1] === classe);
        if (found) found[0] = v;
        saveJSON(LS_SEUILS, state.seuils);
      });
      label.appendChild(document.createTextNode('Classe ' + classe + ' ≥ '));
      label.appendChild(input);
      label.appendChild(document.createTextNode(' %'));
      box.appendChild(label);
    }
  }

  // ---------- essai ----------
  function startRun(exercice, niveau) {
    state.current = { exercice, niveau };
    state.sim = new L.RunSim({ exercice, niveau, echelle: ECHELLE });
    state.run = { phase: 'idle', countdownT: 0, lastTs: 0, raf: null, trail: [], prevDans: true };
    Controls.anchor(state.sim.start[0], state.sim.start[1]);
    $('hud-exercice').textContent = exercice.nom + ' — ' + niveau.nom;
    $('hud-tol').textContent = 'tolérance ' + niveau.tolerance + ' px — départ au début du tracé';
    $('btn-pause').disabled = true;
    show('run');
    render();
  }

  function beginCountdown() {
    if (!state.run || state.run.phase !== 'idle') return;
    state.run.phase = 'countdown';
    state.run.countdownT = 3;
    Controls.anchor(state.sim.start[0], state.sim.start[1]);
    Son.init();
    state.run.lastTs = performance.now();
    state.run.raf = requestAnimationFrame(loop);
  }

  function togglePause() {
    const r = state.run;
    if (!r) return;
    if (r.phase === 'running') {
      r.phase = 'paused';
      $('btn-pause').textContent = 'Reprendre';
    } else if (r.phase === 'paused') {
      r.phase = 'running';
      r.lastTs = performance.now();
      $('btn-pause').textContent = 'Pause';
    }
  }

  function quitRun() {
    if (state.run && state.run.raf) cancelAnimationFrame(state.run.raf);
    state.run = null;
    state.sim = null;
    show('menu');
  }

  function loop(ts) {
    const r = state.run;
    if (!r || r.phase === 'idle' || r.phase === 'done') return;
    const dt = Math.min(0.05, Math.max(0, (ts - r.lastTs) / 1000));
    r.lastTs = ts;
    Controls.update(dt);
    if (r.phase === 'countdown') {
      r.countdownT -= dt;
      if (r.countdownT <= 0) {
        r.phase = 'running';
        r.countdownT = 0;
        $('btn-pause').disabled = false;
      }
    } else if (r.phase === 'running') {
      state.sim.update(dt, Controls.point);
      r.trail.push([Controls.point.x, Controls.point.y]);
      if (r.trail.length > 150) r.trail.shift();
      const tol = state.current.niveau.tolerance;
      const d = state.sim.dernierDistPx;
      if (state.sim.dans && d >= tol * 0.75) Son.bip(1046, 0.06, 'square', 0.04, 0.25);
      if (r.prevDans && !state.sim.dans) Son.bip(196, 0.18, 'sawtooth', 0.07);
      r.prevDans = state.sim.dans;
      if (state.sim.termine) finishRun();
    }
    render();
    r.raf = requestAnimationFrame(loop);
  }

  function finishRun() {
    const r = state.run;
    r.phase = 'done';
    const st = state.sim.stats();
    const { exercice, niveau } = state.current;
    const classe = L.classePour(st.pct, state.seuils);
    const entry = {
      ts: new Date().toISOString(),
      ex: exercice.id,
      nomEx: exercice.nom,
      niveau: niveau.id,
      duree: niveau.duree,
      tolerance: niveau.tolerance,
      temps: Math.round(st.temps * 10) / 10,
      motif: st.motif,
      pct: Math.round(st.pct * 10) / 10,
      sorties: st.sorties,
      ecartMoyenPx: Math.round(st.meanDistPx * 10) / 10,
      ecartMaxPx: Math.round(st.maxDistPx * 10) / 10,
      couverturePct: Math.round(st.couverturePct * 10) / 10,
      classe,
    };
    state.history.unshift(entry);
    if (state.history.length > 500) state.history.length = 500;
    saveJSON(LS_HISTORY, state.history);
    fillResult(entry);
    show('result');
  }

  function fillResult(e) {
    $('res-score').textContent = e.pct.toFixed(1) + ' %';
    $('res-classe').textContent = 'Classe ' + e.classe;
    $('res-classe').className = 'classe-badge classe-' + e.classe;
    $('res-detail').innerHTML =
      '<li>Exercice : <strong>' + e.nomEx + '</strong> — niveau ' + e.niveau + ' (' + e.duree + ' s, tolérance ' + e.tolerance + ' px)</li>' +
      '<li>' + (e.motif === 'arrivee'
        ? 'Arrivée atteinte en <strong>' + e.temps.toFixed(1) + ' s</strong>'
        : 'Temps écoulé : <strong>' + e.temps.toFixed(1) + ' s</strong> / ' + e.duree + ' s') + '</li>' +
      '<li>Temps sur la trajectoire : <strong>' + e.pct.toFixed(1) + ' %</strong> du temps</li>' +
      '<li>Progression : <strong>' + (e.couverturePct || 0).toFixed(0) + ' %</strong> du tracé parcouru</li>' +
      '<li>Sorties de piste : <strong>' + e.sorties + '</strong></li>' +
      '<li>Écart moyen à la piste : <strong>' + e.ecartMoyenPx + ' px</strong> (max ' + e.ecartMaxPx + ' px)</li>' +
      '<li>Date : ' + new Date(e.ts).toLocaleString('fr-FR') + '</li>';
    const bar = $('res-bar');
    bar.innerHTML = '';
    const sorted = state.seuils.slice().sort((a, b) => b[0] - a[0]);
    for (const [min, classe] of sorted) {
      const m = document.createElement('div');
      m.className = 'seuil-marqueur';
      m.style.left = min + '%';
      m.title = 'Classe ' + classe + ' ≥ ' + min + ' %';
      m.innerHTML = '<span>' + classe + '</span>';
      bar.appendChild(m);
    }
    const me = document.createElement('div');
    me.className = 'seuil-moi';
    me.style.left = Math.min(100, e.pct) + '%';
    me.title = e.pct.toFixed(1) + ' %';
    bar.appendChild(me);
  }

  // ---------- rendu canvas ----------
  function render() {
    const canvas = $('board');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = '#2a3550';
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN);

    const sim = state.sim;
    if (sim) {
      const niv = state.current.niveau;
      const c = sim.courbe;
      ctx.beginPath();
      for (let i = 0; i < c.pts.length; i++) {
        const p = toPx(c.pts[i][0], c.pts[i][1]);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      if (sim.exercice.fermee) ctx.closePath();
      ctx.strokeStyle = 'rgba(90, 160, 255, 0.22)';
      ctx.lineWidth = niv.tolerance * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140, 190, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      const [sx, sy] = toPx(sim.start[0], sim.start[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, L.TAU);
      ctx.fillStyle = 'rgba(57, 211, 83, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#39d353';
      ctx.lineWidth = 2;
      ctx.stroke();

      const proj = sim.distancePiste(Controls.point.x, Controls.point.y);
      const pp = toPx(c.pts[proj.index][0], c.pts[proj.index][1]);
      ctx.beginPath();
      ctx.arc(pp[0], pp[1], 4, 0, L.TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

      if (!sim.exercice.fermee) {
        const fin = L.pointSurCourbe(c, c.total);
        const [fx, fy] = toPx(fin[0], fin[1]);
        ctx.beginPath();
        ctx.arc(fx, fy, 9, 0, L.TAU);
        ctx.fillStyle = 'rgba(255, 176, 46, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#ffb02e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const r = state.run;
      if (r && r.trail.length > 1) {
        for (let i = 1; i < r.trail.length; i++) {
          const a = i / r.trail.length;
          const p0 = toPx(r.trail[i - 1][0], r.trail[i - 1][1]);
          const p1 = toPx(r.trail[i][0], r.trail[i][1]);
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(p1[0], p1[1]);
          ctx.strokeStyle = 'rgba(120, 220, 140, ' + (a * 0.5).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      const [ux, uy] = toPx(Controls.point.x, Controls.point.y);
      const sur = sim.stats().dans;
      const couleur = sur ? '#39d353' : '#ff5252';
      ctx.beginPath();
      ctx.arc(ux, uy, 6, 0, L.TAU);
      ctx.fillStyle = couleur;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ux - 12, uy); ctx.lineTo(ux + 12, uy);
      ctx.moveTo(ux, uy - 12); ctx.lineTo(ux, uy + 12);
      ctx.strokeStyle = couleur;
      ctx.lineWidth = 2;
      ctx.stroke();

      updateHud();
    } else {
      ctx.fillStyle = '#9db2d8';
      ctx.font = '22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Appuyez sur « Démarrer » (ou Entrée) pour lancer le compte à rebours', CX, CY);
    }

    const r = state.run;
    if (r && r.phase === 'countdown') {
      ctx.fillStyle = 'rgba(10, 14, 26, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 90px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(r.countdownT)), CX, CY + 30);
    } else if (r && r.phase === 'paused') {
      ctx.fillStyle = 'rgba(10, 14, 26, 0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 48px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSE', CX, CY + 16);
    }
    updateVirtualCranks();
  }

  function updateHud() {
    const sim = state.sim;
    if (!sim) return;
    const st = sim.stats();
    $('hud-temps').textContent = Math.max(0, state.current.niveau.duree - st.temps).toFixed(1) + ' s';
    $('hud-pct').textContent = st.temps > 0 ? (100 * st.tempsSur / st.temps).toFixed(1) + ' %' : '—';
    $('hud-couv').textContent = st.couverturePct.toFixed(0) + ' %';
    $('hud-sorties').textContent = String(st.sorties);
  }

  // ---------- manivelles virtuelles à l'écran (mode simulation) ----------
  function updateVirtualCranks() {
    const box = $('virtual-cranks');
    box.classList.toggle('hidden', !state.showVirtualCranks);
    if (!state.showVirtualCranks) return;
    $('vc-x').style.bottom = (Math.min(1, Math.max(0, Controls.crankX)) * 100) + '%';
    $('vc-y').style.bottom = (Math.min(1, Math.max(0, Controls.crankY)) * 100) + '%';
  }

  function bindVirtualCrank(el, axis) {
    const track = el.parentElement;
    function setFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const v = 1 - (e.clientY - rect.top) / rect.height;
      Controls.setCrank(axis, Math.min(1, Math.max(0, v)));
    }
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); setFromEvent(e); });
    el.addEventListener('pointermove', (e) => { if (e.buttons) setFromEvent(e); });
  }

  // ---------- historique ----------
  function buildHistory() {
    const tbody = $('history-body');
    tbody.innerHTML = '';
    if (state.history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="vide">Aucun essai enregistré pour le moment.</td></tr>';
      return;
    }
    for (const h of state.history) {
      const tr = document.createElement('tr');
      const cells = [
        new Date(h.ts).toLocaleString('fr-FR'),
        h.nomEx, 'N' + h.niveau, h.duree + ' s', h.tolerance + ' px',
        h.pct.toFixed(1) + ' %', h.sorties, (h.couverturePct || 0).toFixed(0) + ' %',
        h.motif === 'arrivee' ? '✓ ' + (h.temps || 0).toFixed(0) + ' s' : '—', 'C' + h.classe,
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function exportCSV() {
    const header = ['date', 'exercice', 'niveau', 'duree_s', 'temps_s', 'arrivee', 'tolerance_px', 'pct_temps_sur_piste', 'sorties', 'ecart_moyen_px', 'ecart_max_px', 'couverture_pct', 'classe'];
    const lines = [header.join(';')];
    for (const h of state.history) {
      lines.push([
        h.ts, '"' + h.nomEx + '"', h.niveau, h.duree, h.temps || h.duree, h.motif === 'arrivee' ? 1 : 0, h.tolerance,
        h.pct, h.sorties, h.ecartMoyenPx, h.ecartMaxPx, h.couverturePct || 0, h.classe,
      ].join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ricochay-historique.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- câblage ----------
  function init() {
    Controls.init();
    Controls.invX = !!MidiRig.config.invX;
    Controls.invY = !!MidiRig.config.invY;
    Controls.cb.pause = () => { if (state.screen === 'run') togglePause(); };
    Controls.cb.start = () => { if (state.screen === 'run' && state.run && state.run.phase === 'idle') beginCountdown(); };
    Controls.cb.stop = () => { if (state.screen === 'run') quitRun(); };

    function handlePadAction(name) {
      if (state.screen !== 'run') return;
      if (name === 'start') { if (state.run && state.run.phase === 'idle') beginCountdown(); }
      else if (name === 'restart') { if (state.current) startRun(state.current.exercice, state.current.niveau); }
      else if (name === 'quit') { quitRun(); }
    }
    function handleBleAction(name) {
      if (state.screen !== 'run') return;
      if (name === 'start') {
        if (state.run && state.run.phase === 'idle') beginCountdown();
        else if (state.current) startRun(state.current.exercice, state.current.niveau);
      } else if (name === 'quit') { quitRun(); }
    }
    function pushMonitor(txt) {
      const ul = $('midi-monitor');
      const li = document.createElement('li');
      li.textContent = txt;
      ul.prepend(li);
      while (ul.children.length > 8) ul.removeChild(ul.lastChild);
    }
    MidiRig.cb.crank = (axis, v) => Controls.setCrank(axis, v);
    MidiRig.cb.action = handlePadAction;
    BleRig.cb.crank = (axis, v) => Controls.setCrank(axis, v);
    BleRig.cb.action = handleBleAction;
    BleRig.cb.status = (txt) => { $('ble-status').textContent = txt; };
    BleRig.cb.raw = pushMonitor;
    MidiRig.cb.status = (txt) => { $('midi-status').textContent = txt; };
    MidiRig.cb.mapping = () => { if (state.screen === 'setup') renderMappingInfo(); };
    MidiRig.cb.raw = pushMonitor;

    $('btn-midi-connect').addEventListener('click', async () => {
      $('midi-status').textContent = 'Demande d\'accès MIDI…';
      await MidiRig.connect();
    });
    $('btn-ble-connect').addEventListener('click', async () => {
      $('ble-status').textContent = 'BLE : connexion…';
      await BleRig.connect();
    });
    $('btn-setup').addEventListener('click', () => show('setup'));
    $('btn-history').addEventListener('click', () => show('history'));
    $('btn-back-menu').addEventListener('click', () => show('menu'));
    $('btn-back-menu2').addEventListener('click', () => show('menu'));
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-clear-history').addEventListener('click', () => {
      state.history = [];
      saveJSON(LS_HISTORY, state.history);
      buildHistory();
    });

    $('btn-learn-x').addEventListener('click', () => { MidiRig.setLearn('x'); renderMappingInfo(); });
    $('btn-learn-y').addEventListener('click', () => { MidiRig.setLearn('y'); renderMappingInfo(); });
    $('btn-learn-auto').addEventListener('click', () => { MidiRig.setLearn('auto'); renderMappingInfo(); });
    $('btn-calib').addEventListener('click', () => {
      if (MidiRig.calib) MidiRig.stopCalib(); else MidiRig.startCalib();
      renderMappingInfo();
    });
    $('btn-midi-reset').addEventListener('click', () => { MidiRig.reset(); renderMappingInfo(); });
    $('btn-pad-start').addEventListener('click', () => { MidiRig.setLearnPad('start'); renderMappingInfo(); });
    $('btn-pad-restart').addEventListener('click', () => { MidiRig.setLearnPad('restart'); renderMappingInfo(); });
    $('btn-pad-quit').addEventListener('click', () => { MidiRig.setLearnPad('quit'); renderMappingInfo(); });
    $('opt-mode').addEventListener('change', (e) => {
      MidiRig.config.mode = e.target.value;
      MidiRig.config.modeExplicite = true;
      MidiRig.last.x = null; MidiRig.last.y = null;
      MidiRig.save();
    });
    $('opt-invx').addEventListener('change', (e) => { MidiRig.config.invX = e.target.checked; Controls.invX = e.target.checked; MidiRig.save(); });
    $('opt-invy').addEventListener('change', (e) => { MidiRig.config.invY = e.target.checked; Controls.invY = e.target.checked; MidiRig.save(); });
    $('opt-sens').addEventListener('input', (e) => {
      MidiRig.config.sensibilite = Number(e.target.value);
      $('opt-sens-val').textContent = MidiRig.config.sensibilite.toFixed(2);
      MidiRig.save();
    });
    $('opt-sens-ble').addEventListener('input', (e) => {
      BleRig.sens = Number(e.target.value);
      $('opt-sens-ble-val').textContent = BleRig.sens.toFixed(2);
      BleRig.save();
    });

    $('btn-start').addEventListener('click', beginCountdown);
    $('btn-pause').addEventListener('click', togglePause);
    $('btn-restart').addEventListener('click', () => { if (state.current) startRun(state.current.exercice, state.current.niveau); });
    $('btn-quit').addEventListener('click', quitRun);
    $('btn-replay').addEventListener('click', () => { if (state.current) startRun(state.current.exercice, state.current.niveau); });
    $('btn-result-menu').addEventListener('click', () => show('menu'));

    $('chk-son').addEventListener('change', (e) => { Son.actif = e.target.checked; });
    $('chk-virtual').addEventListener('change', (e) => {
      state.showVirtualCranks = e.target.checked;
      updateVirtualCranks();
    });

    const canvas = $('board');
    canvas.addEventListener('pointerdown', (e) => { state.dragging = true; canvas.setPointerCapture(e.pointerId); movePointer(e); });
    canvas.addEventListener('pointermove', (e) => { if (state.dragging) movePointer(e); });
    canvas.addEventListener('pointerup', () => { state.dragging = false; });
    function movePointer(e) {
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      const py = (e.clientY - rect.top) * (H / rect.height);
      const n = toNorm(px, py);
      Controls.setPointDirect(n[0], n[1]);
    }

    bindVirtualCrank($('vc-x'), 'x');
    bindVirtualCrank($('vc-y'), 'y');

    if (!MidiRig.supported) {
      $('midi-status').textContent = 'Web MIDI indisponible : ouvrez la page avec Chrome/Edge en localhost ou HTTPS, puis reconnectez.';
    } else {
      MidiRig.connect();
    }
    if (!BleRig.supported) {
      $('ble-status').textContent = 'BLE : Web Bluetooth indisponible (Chrome/Edge, page en localhost ou HTTPS).';
    }

    buildMenu();
    show('menu');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
