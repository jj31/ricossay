// RICOCHAY-ESP — ESP32-C6 + 2 encodeurs KY-040 -> BLE (Nordic UART Service)
// Envoie sur la caractéristique TX NUS des notifications binaires de 2 octets :
//   [0, delta] = axe X (delta int8 signé = pas de quadrature)
//   [1, delta] = axe Y
//   [2, 1]     = appui sur SW de l'encodeur X  -> Démarrer / Recommencer
//   [3, 1]     = appui sur SW de l'encodeur Y  -> Quitter
//
// Câblage (modifiable ci-dessous) :
//   KY-040 X : CLK->GPIO4  DT->GPIO5  SW->GPIO6  (+ -> 3.3V, GND -> GND)
//   KY-040 Y : CLK->GPIO7  DT->GPIO8  SW->GPIO9  (+ -> 3.3V, GND -> GND)
//
// Arduino IDE : carte "ESP32C6 Dev Module", core ESP32 Arduino >= 2.0 (BLE inclus).

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define NUS_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_CHAR_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

#define X_CLK 4
#define X_DT  5
#define X_SW  6
#define Y_CLK 7
#define Y_DT  8
#define Y_SW  9

BLECharacteristic *txChar = nullptr;

// Table de quadrature (1 pas par transition valide)
static const int8_t ENC_TABLE[16] = {0, -1, 1, 0, 1, 0, 0, -1, -1, 0, 0, 1, 0, 1, -1, 0};
volatile uint8_t stateX = 0, stateY = 0;
volatile int32_t countX = 0, countY = 0;
volatile bool flagBtnX = false, flagBtnY = false;

void IRAM_ATTR isrX() {
  stateX = (stateX << 2) | ((digitalRead(X_CLK) << 1) | digitalRead(X_DT));
  int8_t d = ENC_TABLE[stateX & 0x0F];
  if (d) countX += d;
}
void IRAM_ATTR isrY() {
  stateY = (stateY << 2) | ((digitalRead(Y_CLK) << 1) | digitalRead(Y_DT));
  int8_t d = ENC_TABLE[stateY & 0x0F];
  if (d) countY += d;
}

// Boutons SW (actifs à l'état bas), anti-rebond simple
uint32_t lastPressX = 0, lastPressY = 0;
void pollButtons() {
  uint32_t now = millis();
  if (digitalRead(X_SW) == LOW && now - lastPressX > 250) { lastPressX = now; flagBtnX = true; }
  if (digitalRead(Y_SW) == LOW && now - lastPressY > 250) { lastPressY = now; flagBtnY = true; }
}

void setup() {
  Serial.begin(115200);
  pinMode(X_CLK, INPUT_PULLUP);
  pinMode(X_DT, INPUT_PULLUP);
  pinMode(X_SW, INPUT_PULLUP);
  pinMode(Y_CLK, INPUT_PULLUP);
  pinMode(Y_DT, INPUT_PULLUP);
  pinMode(Y_SW, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(X_CLK), isrX, CHANGE);
  attachInterrupt(digitalPinToInterrupt(X_DT), isrX, CHANGE);
  attachInterrupt(digitalPinToInterrupt(Y_CLK), isrY, CHANGE);
  attachInterrupt(digitalPinToInterrupt(Y_DT), isrY, CHANGE);

  BLEDevice::init("RICOCHAY-ESP");
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(NUS_SERVICE_UUID);
  txChar = service->createCharacteristic(NUS_TX_CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  service->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(NUS_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("RICOCHAY-ESP pret (BLE annonce, service NUS)");
}

void loop() {
  int32_t cx, cy;
  bool b1, b2;
  noInterrupts();
  cx = countX; countX = 0;
  cy = countY; countY = 0;
  b1 = flagBtnX; flagBtnX = false;
  b2 = flagBtnY; flagBtnY = false;
  interrupts();

  pollButtons();

  static int32_t pendX = 0, pendY = 0;
  pendX += cx;
  pendY += cy;

  uint8_t pkt[20]; // MTU 23 -> 20 octets utiles = 10 enregistrements
  int n = 0;
  while (pendX != 0 && n + 2 <= sizeof(pkt)) {
    int8_t d = pendX > 127 ? 127 : (pendX < -128 ? -128 : (int8_t)pendX);
    pkt[n++] = 0;
    pkt[n++] = (uint8_t)d;
    pendX -= d;
  }
  while (pendY != 0 && n + 2 <= sizeof(pkt)) {
    int8_t d = pendY > 127 ? 127 : (pendY < -128 ? -128 : (int8_t)pendY);
    pkt[n++] = 1;
    pkt[n++] = (uint8_t)d;
    pendY -= d;
  }
  if (b1 && n + 2 <= sizeof(pkt)) { pkt[n++] = 2; pkt[n++] = 1; }
  if (b2 && n + 2 <= sizeof(pkt)) { pkt[n++] = 3; pkt[n++] = 1; }

  if (n > 0 && txChar && BLEDevice::getInitialized()) {
    txChar->setValue(pkt, n);
    txChar->notify();
  }
  delay(5);
}
