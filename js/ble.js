(function () {
  'use strict';

  // Interface BLE (Web Bluetooth) : ESP32-C6 + 2 encodeurs KY-040.
  // Protocole binaire, 2 octets par événement, en notification sur la
  // caractéristique TX du service Nordic UART (NUS) :
  //   [0, delta] = axe X (delta int8 signé = pas de quadrature)
  //   [1, delta] = axe Y
  //   [2, 1]     = appui sur SW de l'encodeur X -> Démarrer / Recommencer
  //   [3, 1]     = appui sur SW de l'encodeur Y -> Quitter
  const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const NUS_TX_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  const LS_KEY = 'ricochay.ble.v1';
  const BASE_STEP = 0.03; // unités de champ par pas de quadrature, avant sensibilité

  const BleRig = {
    supported: typeof navigator !== 'undefined' && !!navigator.bluetooth,
    device: null,
    characteristic: null,
    connected: false,
    crank: { x: 0, y: 0 }, // manivelles virtuelles NON bornées (encodeurs infinis)
    sens: 1.0,
    cb: {
      crank: function () {},  // (axis 'x'|'y', valeur manivelle)
      action: function () {}, // ('start' | 'quit')
      status: function () {},
      raw: function () {},
    },

    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const c = JSON.parse(raw);
          if (typeof c.sens === 'number') this.sens = c.sens;
        }
      } catch (e) { /* on garde le défaut */ }
    },
    save() {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ sens: this.sens })); } catch (e) {}
    },

    // Décode un paquet BLE et applique les événements (fonction pure, testable).
    applyPacket(bytes) {
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = bytes[i];
        let d = bytes[i + 1];
        if (d > 127) d -= 256; // int8 signé
        if (code === 0 || code === 1) {
          const axis = code === 0 ? 'x' : 'y';
          this.crank[axis] = Math.max(-100, Math.min(100, this.crank[axis] + d * BASE_STEP * this.sens));
          this.cb.crank(axis, this.crank[axis]);
          this.cb.raw('BLE ' + axis.toUpperCase() + ' ' + (d > 0 ? '+' : '') + d + ' -> manivelle ' + this.crank[axis].toFixed(2));
        } else if (code === 2) {
          this.cb.action('start');
          this.cb.raw('BLE bouton X -> start/restart');
        } else if (code === 3) {
          this.cb.action('quit');
          this.cb.raw('BLE bouton Y -> quit');
        }
      }
    },

    async connect() {
      if (!this.supported) {
        this.cb.status('Web Bluetooth indisponible : Chrome/Edge requis, page en localhost ou HTTPS.');
        return false;
      }
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [NUS_SERVICE] }],
          optionalServices: [NUS_SERVICE],
        });
      } catch (e) {
        try {
          this.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [NUS_SERVICE],
          });
        } catch (e2) {
          this.cb.status('Connexion BLE annulée ou refusée.');
          return false;
        }
      }
      try {
        this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(NUS_SERVICE);
        this.characteristic = await service.getCharacteristic(NUS_TX_CHAR);
        await this.characteristic.startNotifications();
        this.characteristic.addEventListener('characteristicvaluechanged', (e) => {
          const v = e.target.value;
          this.applyPacket(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        });
        this.connected = true;
        this.cb.status('BLE connecté : ' + (this.device.name || 'ESP32') + ' — KY-040 actifs (X/Y + boutons).');
        return true;
      } catch (e) {
        this.cb.status('Erreur BLE : service NUS introuvable — vérifiez le firmware. (' + (e.message || e) + ')');
        return false;
      }
    },

    onDisconnect() {
      this.connected = false;
      this.cb.status('BLE déconnecté.');
    },

    async disconnect() {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        try { if (this.characteristic) await this.characteristic.stopNotifications(); } catch (e) {}
        this.device.gatt.disconnect();
      }
    },
  };

  BleRig.load();
  window.BleRig = BleRig;
})();
