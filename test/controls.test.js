'use strict';
// Tests du module Controls. Lancement : node test/controls.test.js
const path = require('path');
global.window = { addEventListener: function () {} };

require(path.join(__dirname, '..', 'js', 'controls.js'));
const C = global.window.Controls;

let echecs = 0;
function ok(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { echecs++; console.error('  ECHEC  ' + msg); }
}

C.setCrank('x', 1);
ok(Math.abs(C.point.x - 1) < 1e-12 && Math.abs(C.point.y - 0) < 1e-12, 'manivelle X à 1 -> point.x = 1 (Y centrée)');
C.setCrank('y', 0);
ok(Math.abs(C.point.y + 1) < 1e-12, 'manivelle Y à 0 -> point.y = -1');
C.setCrank('x', 0.5); C.setCrank('y', 0.5);
ok(Math.abs(C.point.x) < 1e-12 && Math.abs(C.point.y) < 1e-12, 'manivelles centrées -> point au centre');

C.keys['ArrowRight'] = true;
C.update(0.5);
ok(Math.abs(C.crankX - (0.5 + 0.6 * 0.5)) < 1e-12, 'flèche droite 0.5 s -> manivelle X avance de 0.3');
C.keys['ArrowRight'] = false;
C.keys['ArrowUp'] = true;
C.update(0.25);
ok(Math.abs(C.crankY - (0.5 + 0.6 * 0.25)) < 1e-12, 'flèche haut -> manivelle Y augmente');
C.keys['ArrowUp'] = false;
C.keys['ArrowLeft'] = true;
C.update(10);
ok(C.crankX === 0, 'manivelle X bornée à 0 après un appui long');
C.keys['ArrowLeft'] = false;

C.setPointDirect(0.4, -0.3);
ok(Math.abs(C.point.x - 0.4) < 1e-12 && Math.abs(C.point.y + 0.3) < 1e-12, 'souris : point direct (0.4, -0.3)');
ok(Math.abs(C.crankX - 0.7) < 1e-12 && Math.abs(C.crankY - 0.35) < 1e-12, 'souris : manivelles synchronisées');
C.setPointDirect(5, -9);
ok(C.point.x === 1 && C.point.y === -1, 'point borné à [-1, 1]');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : '\n' + echecs + ' ECHEC(S)');
process.exit(echecs === 0 ? 0 : 1);
