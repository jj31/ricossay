'use strict';
// Tests du module MIDI (apprentissage des boutons, calibration, modes de lecture)
// avec des stubs navigateur minimaux. Lancement : node test/midi.test.js
const path = require('path');

const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.window = {};

require(path.join(__dirname, '..', 'js', 'midi.js'));
const M = global.window.MidiRig;

let echecs = 0;
function ok(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { echecs++; console.error('  ECHEC  ' + msg); }
}
const cc = (n, v) => M.handleMessage({ data: [0xB0, n, v] });

console.log('Valeurs par défaut');
ok(M.config.ccX === 48 && M.config.ccY === 49, 'CC par défaut 48 (X) et 49 (Y)');
ok(M.config.mode === 'relatif', 'mode relatif par défaut (encodeurs infinis, sans butées)');
ok(M.config.sensibilite === 1.5, 'sensibilité par défaut 1.5');

console.log('Apprentissage manuel');
M.setLearn('x');
cc(60, 10);
ok(M.config.ccX === 60 && M.learn === null, 'apprentissage X : CC 60 assigné à X');
M.setLearn('y');
cc(61, 10);
ok(M.config.ccY === 61, 'apprentissage Y : CC 61 assigné à Y');

console.log('Apprentissage auto (X puis Y)');
M.setLearn('auto');
cc(20, 5);
ok(M.config.ccX === 20, '1er bouton tourné -> X');
cc(20, 6);
ok(M.config.ccY !== 20 && M.learn === 'auto', 'même bouton à nouveau : toujours en attente de Y');
cc(21, 5);
ok(M.config.ccY === 21 && M.learn === null, '2e bouton différent -> Y, apprentissage terminé');

console.log('Mode position absolue + inversion (si potentiomètres avec butées)');
M.config.ccX = 48; M.config.ccY = 49;
M.config.mode = 'position'; M.config.modeExplicite = true;
M.config.minX = 0; M.config.maxX = 127; M.config.invX = false;
let rec = null;
M.cb.crank = (axis, v) => { rec = [axis, v]; };
cc(48, 127); ok(rec[0] === 'x' && Math.abs(rec[1] - 1) < 1e-9, 'CC max -> manivelle à 1');
cc(48, 0); ok(Math.abs(rec[1]) < 1e-9, 'CC min -> manivelle à 0');
cc(48, 64); ok(Math.abs(rec[1] - 64 / 127) < 1e-9, 'CC 64 -> ~0.504');
M.config.invX = true;
cc(48, 0); ok(Math.abs(rec[1]) < 1e-9, 'inversion gérée côté Controls : au niveau MIDI, CC min -> 0 (pas de double inversion)');
M.config.invX = false;
cc(99, 10); ok(rec[0] === 'x' && Math.abs(rec[1]) < 1e-9, 'CC non assigné (99) ignoré (dernier crank X inchangé = 0)');

console.log('Calibration des butées');
M.config.minX = 0; M.config.maxX = 127;
M.startCalib();
cc(48, 7); cc(48, 122); cc(48, 60);
cc(49, 3); cc(49, 125);
M.stopCalib();
ok(M.config.minX === 7 && M.config.maxX === 122, 'butées X apprises : 7–122');
ok(M.config.minY === 3 && M.config.maxY === 125, 'butées Y apprises : 3–125');
cc(48, 7); ok(Math.abs(rec[1]) < 1e-9, 'butée min -> 0');
cc(48, 122); ok(Math.abs(rec[1] - 1) < 1e-9, 'butée max -> 1');

console.log('Mode relatif (encodeurs infinis : manivelle NON bornée, amplitude illimitée)');
M.config.mode = 'relatif';
M.config.sensibilite = 1;
M.crank.x = 0.5; M.last.x = null;
cc(48, 10); ok(Math.abs(M.crank.x - 0.5) < 1e-12, 'premier message : pas de déplacement');
cc(48, 12); ok(Math.abs(M.crank.x - (0.5 + 2 * 0.02)) < 1e-12, '+2 crans -> +0.04 (pas 0.02)');
cc(48, 10); ok(Math.abs(M.crank.x - 0.5) < 1e-12, '-2 crans -> retour à 0.5');
cc(48, 127); ok(M.crank.x < 0.5, '127 apres 10 : delta -11 (bouclage) -> diminue');
cc(48, 0); ok(M.crank.x > 0.5 - 11 * 0.02, '0 apres 127 : delta +1 (bouclage) -> augmente legerement');
{
  let v = 10;
  for (let i = 0; i < 80; i++) { v = (v + 1) % 128; cc(48, v); }
  ok(M.crank.x > 1, '80 crans dans le même sens : manivelle > 1 (non bornée à [0,1]), crank=' + M.crank.x.toFixed(2));
}
cc(48, 65); ok(true, 'valeur 65 reçue');
{
  const before = M.crank.x;
  cc(48, 65); ok(Math.abs(M.crank.x - (before + 0.02)) < 1e-12, 'convention 65 = +1 cran');
  cc(48, 63); ok(Math.abs(M.crank.x - before) < 1e-12, 'convention 63 = -1 cran');
}
M.config.mode = 'position';

console.log('Persistance');
ok(store['ricochay.config.v1'] && JSON.parse(store['ricochay.config.v1']).ccX === 48, 'config sauvegardée dans localStorage');

console.log('Migration : ancienne config (sans modeExplicite) -> mode relatif, CC appris conservés');
store['ricochay.config.v1'] = JSON.stringify({ inputName: 'MPK mini', ccX: 55, ccY: 56, mode: 'position', sensibilite: 1 });
M.load();
ok(M.config.mode === 'relatif', 'mode forcé en relatif (encodeurs infinis, plus de butées)');
ok(M.config.ccX === 55 && M.config.ccY === 56 && M.config.inputName === 'MPK mini', 'CC appris et entrée conservés');
M.config.ccX = 48; M.config.ccY = 49; M.config.mode = 'relatif'; M.save();

console.log('Pads de fonction (apprentissage par appui + actions)');
let action = null;
M.cb.action = (n) => { action = n; };
M.setLearnPad('start');
M.handleMessage({ data: [0x90, 36, 100] });
ok(M.config.padStart === 36 && M.learnPad === null, 'apprentissage pad Démarrer : note 36 assignée');
M.handleMessage({ data: [0x90, 36, 100] });
ok(action === 'start', 'appui note 36 -> action start');
M.setLearnPad('restart');
M.handleMessage({ data: [0x91, 37, 100] });
ok(M.config.padRestart === 37, 'apprentissage pad Recommencer : note 37 (canal 2 accepté)');
M.handleMessage({ data: [0x90, 37, 100] });
ok(action === 'restart', 'appui note 37 -> action restart');
M.setLearnPad('quit');
M.handleMessage({ data: [0x90, 38, 100] });
M.handleMessage({ data: [0x90, 38, 100] });
ok(action === 'quit', 'appui note 38 -> action quit');
M.handleMessage({ data: [0x90, 39, 100] });
ok(action === 'quit', 'note 39 non assignée : aucune action (action précédente conservée)');
M.handleMessage({ data: [0x80, 38, 0] });
ok(action === 'quit', 'Note Off ignoré (pas d\'action au relâchement)');
M.handleMessage({ data: [0x90, 38, 0] });
ok(action === 'quit', 'Note On vélocité 0 ignoré');
ok(JSON.parse(store['ricochay.config.v1']).padStart === 36, 'pads persistés dans localStorage');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
