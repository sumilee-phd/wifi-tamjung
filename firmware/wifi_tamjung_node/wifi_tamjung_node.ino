// 와이파이 탐정단 측정 노드 (ESP32 DevKit, Arduino)
// 강연자 노트북의 모바일 핫스팟에 접속해, 연결된 AP의 신호세기(RSSI)를
// 1초마다 UDP 8601로 보낸다. 서버 주소는 핫스팟 게이트웨이(노트북)로 자동 설정.
// LIBRARY_SSID가 있으면 5초마다 주변을 백그라운드로 스캔해, 그 이름의 공유기 중 가장 센 값을
// lib_rssi로 함께 보낸다. 도서관 와이파이에 접속하지 않으므로 암호·로그인이 필요 없다.
//
// 기기마다 NODE_ID 한 줄만 바꿔 올린다. 본체 스티커 번호와 같아야 한다.
// 핫스팟 이름·암호는 secrets.h에 둔다(저장소에 올리지 않음). secrets.example.h 참고.

#include <WiFi.h>
#include <WiFiUdp.h>
#include "secrets.h"   // HOTSPOT_SSID, HOTSPOT_PASS, LIBRARY_SSID(없으면 "")

const char* NODE_ID = "N1";          // N1, N2, N3, N4
const uint16_t SERVER_PORT = 8601;
const uint32_t PERIOD_MS = 1000;
const int LED_PIN = 2;               // 보드마다 다를 수 있음. 없으면 -1
const uint32_t SCAN_MS = 5000;       // 도서관 와이파이 스캔 주기
const uint32_t LIB_FRESH_MS = 12000; // 이보다 오래된 스캔 값은 보내지 않음

WiFiUDP udp;
uint32_t lastSend = 0, lastScan = 0, libAt = 0;
int libRssi = 0;
bool scanning = false;

void scanLibrary() {
  if (strlen(LIBRARY_SSID) == 0) return;
  if (!scanning && millis() - lastScan >= SCAN_MS) {
    WiFi.scanNetworks(true, false, false, 120);   // 비동기, 채널당 120ms
    scanning = true;
    lastScan = millis();
  }
  if (!scanning) return;
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  scanning = false;
  if (n < 0) return;                              // 실패하면 다음 주기에 다시
  int best = -127;
  for (int i = 0; i < n; i++) {
    if (WiFi.SSID(i) == LIBRARY_SSID && WiFi.RSSI(i) > best) best = WiFi.RSSI(i);
  }
  WiFi.scanDelete();
  if (best > -127) { libRssi = best; libAt = millis(); }
}

void led(bool on) { if (LED_PIN >= 0) digitalWrite(LED_PIN, on ? HIGH : LOW); }

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(HOTSPOT_SSID, HOTSPOT_PASS);
  Serial.print("핫스팟 접속 중");
  while (WiFi.status() != WL_CONNECTED) {   // 접속 중에는 깜빡임
    led(true); delay(150); led(false); delay(350);
    Serial.print(".");
  }
  Serial.printf("\n접속됨 IP %s, 서버 %s\n",
                WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str());
}

void setup() {
  Serial.begin(115200);
  if (LED_PIN >= 0) pinMode(LED_PIN, OUTPUT);
  connectWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {      // 끊기면(호일 실험 등) 다시 접속
    led(false);
    WiFi.disconnect();
    connectWifi();
  }
  if (millis() - lastSend >= PERIOD_MS) {
    lastSend = millis();
    int rssi = WiFi.RSSI();
    char msg[120];
    if (libAt && millis() - libAt < LIB_FRESH_MS)
      snprintf(msg, sizeof(msg), "{\"node_id\":\"%s\",\"zone\":\"--\",\"rssi\":%d,\"lib_rssi\":%d}", NODE_ID, rssi, libRssi);
    else
      snprintf(msg, sizeof(msg), "{\"node_id\":\"%s\",\"zone\":\"--\",\"rssi\":%d}", NODE_ID, rssi);
    udp.beginPacket(WiFi.gatewayIP(), SERVER_PORT);
    udp.print(msg);
    udp.endPacket();
    led(true);
    Serial.println(msg);
  }
  scanLibrary();
}
