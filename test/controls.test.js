'use strict';
// Tests du module Controls (ancrage au départ, manivelles -> point, clavier, souris).
// Lancement : node test/controls.test.js
const path = require('path');
global.window = { addEventListener: function () {} };

require(path.join(__dirname, '..', 'js', 'controls.js'));
const C = global.window.Controls;

let echecs = 0;
function ok(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { echecs++; console.error('  ECHEC  ' + msg); }
}

ok(Math.abs(C.point.x) < 1e-12 && Math.abs(C.point.y) < 1e-12, 'point initial au centre (0,0)');

console.log('Ancrage au départ du tracé');
C.anchor(0.2, -0.1);
ok(Math.abs(C.point.x - 0.2) < 1e-12 && Math.abs(C.point.y + 0.1) < 1e-12, 'anchor(0.2, -0.1) -> point au départ, quelles que soient les manivelles');
C.setCrank('x', 0.6);
ok(Math.abs(C.point.x - 0.4) < 1e-12 && Math.abs(C.point.y + 0.1) < 1e-12, 'manivelle X 0.5 -> 0.6 : point relatif à l\'origine (+0.2)');
C.setCrank('x', 0.5);
ok(Math.abs(C.point.x - 0.2) < 1e-12, 'retour manivelle X -> point au départ');

console.log('Souris / manivelles à l\'écran (position directe)');
C.setPointDirect(0.9, 0.9);
ok(Math.abs(C.point.x - 0.9) < 1e-12 && Math.abs(C.point.y - 0.9) < 1e-12, 'setPointDirect(0.9, 0.9)');
C.setCrank('x', C.crankX); // même valeur : le point ne doit pas bouger
C.setCrank('y', C.crankY);
ok(Math.abs(C.point.x - 0.9) < 1e-12 && Math.abs(C.point.y - 0.9) < 1e-12, 'origine des manivelles réajustée : cohérence point/manivelles');
C.setPointDirect(5, -9);
ok(C.point.x === 1 && C.point.y === -1, 'point borné à [-1, 1]');

console.log('Clavier (déplacement relatif à l\'origine)');
C.anchor(-0.5, 0.5);
C.keys['ArrowRight'] = true;
C.update(0.5);
ok(Math.abs(C.crankX - (0.5 + 0.6 * 0.5)) < 1e-12, 'flèche droite 0.5 s -> manivelle X +0.3');
ok(Math.abs(C.point.x - (-0.5 + 0.3 * 2)) < 1e-12, 'point déplacé relativement au départ');
C.keys['ArrowRight'] = false;
C.keys['ArrowLeft'] = true;
C.update(10);
ok(C.crankX < 0, 'manivelle X non bornée (peut descendre sous 0), crankX=' + C.crankX.toFixed(2));
ok(C.point.x === -1, 'seul le point est borné au bord du plateau (-1)');
C.keys['ArrowLeft'] = false;

console.log('Inversion des axes (niveau Controls : toutes sources MIDI/BLE/clavier)');
C.invY = true;
C.anchor(0, 0);
C.setCrank('y', 0.6);
ok(C.point.y < 0, 'invY : manivelle Y vers le haut -> point vers le bas (inversé)');
C.setCrank('y', 0.4);
ok(C.point.y > 0, 'manivelle Y vers le bas -> point vers le haut');
C.setCrank('y', 0.5);
ok(Math.abs(C.point.y) < 1e-12, 'manivelle au centre -> point au centre');
C.setPointDirect(0, 0.5);
C.setCrank('y', C.crankY);
ok(Math.abs(C.point.y - 0.5) < 1e-12, 'souris + manivelle cohérents malgré l\'inversion');
C.invY = false;
C.anchor(0, 0);
C.setCrank('y', 0.5);
ok(Math.abs(C.point.y) < 1e-12, 'invY désactivé + ré-ancrage : comportement normal');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
