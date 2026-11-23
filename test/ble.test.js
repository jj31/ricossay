'use strict';
// Tests du décodage BLE (paquets 2 octets -> manivelles non bornées + actions).
// Lancement : node test/ble.test.js
const path = require('path');

const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
global.window = {};

require(path.join(__dirname, '..', 'js', 'ble.js'));
const B = global.window.BleRig;

let echecs = 0;
function ok(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { echecs++; console.error('  ECHEC  ' + msg); }
}

const crankCalls = [];
const actions = [];
B.cb.crank = (axis, v) => crankCalls.push([axis, v]);
B.cb.action = (n) => actions.push(n);
B.sens = 1;

console.log('Décodage des paquets BLE');
B.applyPacket(new Uint8Array([0, 5]));
ok(crankCalls.length === 1 && crankCalls[0][0] === 'x' && Math.abs(crankCalls[0][1] - 5 * 0.03) < 1e-12,
  '[0,+5] -> manivelle X = +0.15 (pas de 0.03)');
B.applyPacket(new Uint8Array([0, 200])); // 200 - 256 = -56 (int8 signé)
ok(Math.abs(B.crank.x - (0.15 - 56 * 0.03)) < 1e-12, '[0,200] -> delta -56 (int8 signé)');
B.applyPacket(new Uint8Array([1, 3]));
ok(Math.abs(B.crank.y - 3 * 0.03) < 1e-12, '[1,+3] -> manivelle Y = +0.09');
B.applyPacket(new Uint8Array([2, 1, 3, 1]));
ok(actions.join(',') === 'start,quit', 'paquet multiple : [2,1] -> start, [3,1] -> quit');
B.applyPacket(new Uint8Array([0, 255]));
ok(Math.abs(B.crank.x - (0.15 - 56 * 0.03 - 0.03)) < 1e-12, '[0,255] -> delta -1');

console.log('Manivelle non bornée + sensibilité');
B.crank.x = 0;
for (let i = 0; i < 100; i++) B.applyPacket(new Uint8Array([0, 127])); // +127*0.03 = +3.81 x100
ok(B.crank.x <= 100 && B.crank.x > 50, '100 paquets de +127 : manivelle monte librement puis plafond à 100 (crank=' + B.crank.x.toFixed(1) + ')');
B.crank.x = 0;
B.sens = 2;
B.applyPacket(new Uint8Array([0, 1]));
ok(Math.abs(B.crank.x - 0.06) < 1e-12, 'sensibilité 2 -> 1 pas = 0.06');
B.sens = 1;
B.crank.x = 0;
B.sens = 0.05; // minimum du curseur
B.applyPacket(new Uint8Array([0, 1]));
ok(Math.abs(B.crank.x - 0.03 * 0.05) < 1e-12, 'sensibilité minimale 0.05 -> 1 pas = 0.0015 (réglage fin possible)');
B.sens = 1;

console.log('Persistance sensibilité');
B.sens = 2.5;
B.save();
ok(JSON.parse(store['ricochay.ble.v1']).sens === 2.5, 'sensibilité BLE persistée');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
