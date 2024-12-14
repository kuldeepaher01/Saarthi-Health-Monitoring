#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MLX90614.h>
#include "MAX30100_PulseOximeter.h"
#include "icons.h"

// OLED Configuration
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

// Pin Definitions
#define ECG_PIN 34
#define MAX30100_DEBUG_INTERVAL 2000  // Debug print every 2 seconds

// Timing Constants
#define ECG_SAMPLING_INTERVAL     4     // 4ms (250Hz)
#define VITALS_UPDATE_INTERVAL    1000  // 1 second
#define DISPLAY_UPDATE_INTERVAL   100   // 100ms
#define ECG_MEASUREMENT_DURATION  30000 // 30 seconds
#define VITALS_MEASUREMENT_DURATION 60000 // 60 seconds
#define ECG_BUFFER_SIZE          20     // Number of samples to buffer

// Command Definitions
#define CMD_START_ECG    0x31  // '1'
#define CMD_STOP_ECG     0x30  // '0'
#define CMD_START_VITALS 0x33  // '3'
#define CMD_STOP_VITALS  0x34  // '4'


// BLE UUIDs
#define HEART_RATE_SERVICE_UUID        (uint16_t)0x180D
#define HEART_RATE_CHARACTERISTIC_UUID (uint16_t)0x2A37
#define HEALTH_THERM_SERVICE_UUID      (uint16_t)0x1809
#define TEMPERATURE_CHAR_UUID          (uint16_t)0x2A1C
#define SPO2_SERVICE_UUID              (uint16_t)0x1822
#define SPO2_CHARACTERISTIC_UUID       (uint16_t)0x2A5E

#define ECG_SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define ECG_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"


// Global Objects
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_MLX90614 mlx;
PulseOximeter pox;
BLEServer* pServer = nullptr;
BLECharacteristic* pEcgCharacteristic = nullptr;
BLECharacteristic* pHeartRateCharacteristic = nullptr;
BLECharacteristic* pTempCharacteristic = nullptr;
BLECharacteristic* pSpO2Characteristic = nullptr;


// State Variables
struct DeviceState {
  bool bleConnected = false;
  bool ecgActive = false;
  bool vitalsActive = false;
  bool initError = false;
  unsigned long measurementStartTime = 0;
  unsigned long lastEcgReading = 0;
  unsigned long lastVitalsUpdate = 0;
  unsigned long lastDisplayUpdate = 0;
  uint16_t ecgBuffer[ECG_BUFFER_SIZE];
  int ecgBufferIndex = 0;
  float currentHeartRate = 0;
  uint8_t currentSpO2 = 0;
  float currentTemp = 0;
  unsigned long lastDebugUpdate = 0;
  bool poxActive = false;  // Track if pulse oximeter is running
} state;

// Function Declarations
void setupBLE();
void setupEcgService();
void setupHealthServices();
void displayEcgScreen();
void displayVitalsScreen();
void onBeatDetected();
void startAdvertising();
void initializeSensors();
void updateDisplay();
void handleEcgMeasurement();
void handleVitalsMeasurement();
void sendEcgBuffer();
void updateVitals();
void handleCommand(uint8_t command);
void debugMAX30100();


// Callback for PulseOximeter beat detection
void onBeatDetected() {
  Serial.println("♥ Beat!");
  // Could add visual feedback on display here
}

// BLE Server Callbacks
class ServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
      state.bleConnected = true;
      Serial.println("Client connected");
      updateDisplay();
    }

    void onDisconnect(BLEServer* pServer) override {
      state.bleConnected = false;
      state.ecgActive = false;
      state.vitalsActive = false;
      Serial.println("Client disconnected");
      BLEDevice::startAdvertising();
      updateDisplay();
    }
};

// BLE Characteristic Callbacks
class CharacteristicCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
      String rxValue = pCharacteristic->getValue();
      if (rxValue.length() > 0) {
        uint8_t command = rxValue[0];
        handleCommand(command);
      }
    }

    void handleCommand(uint8_t command) {
      switch (command) {
        case CMD_START_ECG:
          if (!state.ecgActive && !state.vitalsActive) {
            state.ecgActive = true;
            state.measurementStartTime = millis();
            state.ecgBufferIndex = 0;
            Serial.println("ECG measurement started");
          }
          break;

        case CMD_STOP_ECG:
          if (state.ecgActive) {
            state.ecgActive = false;
            sendEcgBuffer(); // Send any remaining data
            Serial.println("ECG measurement stopped");
          }
          break;

        case CMD_START_VITALS:
          if (!state.ecgActive && !state.vitalsActive) {
            state.vitalsActive = true;
            state.measurementStartTime = millis();
            if (!state.poxActive) {
              pox.resume();
              state.poxActive = true;
              Serial.println("Pulse oximeter resumed");
            }
            Serial.println("Vitals measurement started");
          }
          break;

        case CMD_STOP_VITALS:
          if (state.vitalsActive) {
            state.vitalsActive = false;
            if (state.poxActive) {
              pox.shutdown();
              state.poxActive = false;
              Serial.println("Pulse oximeter shut down");
            }
            Serial.println("Vitals measurement stopped");
          }
          break;
      }
      updateDisplay();
    }
};

void setup() {
  Serial.begin(115200);
  Wire.begin();

  // Initialize Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println(F("SSD1306 allocation failed"));
    state.initError = true;
  }

  display.clearDisplay();
  display.setTextColor(WHITE);  // Set default text color
  display.setTextSize(1);       // Set default text size
  display.cp437(true);          // Use full 256 char 'Code Page 437' font
  display.dim(false);           // Set maximum contrast
  display.setTextWrap(false);   // Disable text wrapping

  // Show initial display buffer to ensure display is working
  display.display();
  delay(100);  // Brief delay to ensure display is ready

  // Show welcome screen
  showWelcomeScreen();
  delay(2000);  // Show welcome screen for 2 seconds

  // Initialize other components
  initializeSensors();

  // Setup BLE if no initialization errors occurred
  if (!state.initError) {
    setupBLE();
  }

  // Clear display and show initial state
  display.clearDisplay();
  updateDisplay();
  display.display();  // Make sure to call display() after updating
}

void initializeSensors() {
  // Initialize MLX90614
  if (!mlx.begin()) {
    Serial.println("MLX90614 initialization failed");
    state.initError = true;
    return;
  }

  Serial.println("Initializing MAX30100...");
  if (!pox.begin()) {
    Serial.println("MAX30100 initialization failed!");
    Serial.println("Check your wiring and I2C address!");
    // Try to get more information
    Wire.beginTransmission(0x57); // MAX30100 I2C address
    if (Wire.endTransmission() != 0) {
      Serial.println("MAX30100 not found on I2C bus!");
    }
    state.initError = true;
    return;
  }

  Serial.println("MAX30100 initialized successfully!");
  pox.setOnBeatDetectedCallback(onBeatDetected);
  // pox.setIRLedCurrent(MAX30100_LED_CURR_7_6MA);
  state.poxActive = false;
  pox.shutdown();
}
void debugMAX30100() {
  if (millis() - state.lastDebugUpdate >= MAX30100_DEBUG_INTERVAL) {
    Serial.println("\n=== MAX30100 Debug Info ===");
    Serial.print("Heart Rate: ");
    Serial.print(pox.getHeartRate());
    Serial.print(" bpm / SpO2: ");
    Serial.print(pox.getSpO2());
    Serial.println("%");

    // Simple connection status
    Serial.print("Sensor Status: ");
    Serial.println(state.poxActive ? "Active" : "Inactive");
    Serial.println("========================");

    state.lastDebugUpdate = millis();
  }
}

void setupBLE() {
  BLEDevice::init("HEALTH_MONITOR");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  // Create services and characteristics
  setupEcgService();
  setupHealthServices();

  // Start advertising
  startAdvertising();
  Serial.println("BLE advertising started");
}

void setupEcgService() {
  BLEService *pEcgService = pServer->createService(ECG_SERVICE_UUID);
  pEcgCharacteristic = pEcgService->createCharacteristic(
                         ECG_CHARACTERISTIC_UUID,
                         BLECharacteristic::PROPERTY_READ |
                         BLECharacteristic::PROPERTY_WRITE |
                         BLECharacteristic::PROPERTY_NOTIFY
                       );
  pEcgCharacteristic->setCallbacks(new CharacteristicCallbacks());
  pEcgCharacteristic->addDescriptor(new BLE2902());
  pEcgService->start();
}

void setupHealthServices() {
  // Heart Rate Service
  BLEService *pHrService = pServer->createService(HEART_RATE_SERVICE_UUID);
  pHeartRateCharacteristic = pHrService->createCharacteristic(
                               HEART_RATE_CHARACTERISTIC_UUID,
                               BLECharacteristic::PROPERTY_READ |
                               BLECharacteristic::PROPERTY_NOTIFY
                             );
  pHeartRateCharacteristic->addDescriptor(new BLE2902());
  pHrService->start();

  // Temperature Service
  BLEService *pTempService = pServer->createService(HEALTH_THERM_SERVICE_UUID);
  pTempCharacteristic = pTempService->createCharacteristic(
                          TEMPERATURE_CHAR_UUID,
                          BLECharacteristic::PROPERTY_READ |
                          BLECharacteristic::PROPERTY_NOTIFY
                        );
  pTempCharacteristic->addDescriptor(new BLE2902());
  pTempService->start();

  // SpO2 Service
  BLEService *pSpO2Service = pServer->createService(SPO2_SERVICE_UUID);
  pSpO2Characteristic = pSpO2Service->createCharacteristic(
                          SPO2_CHARACTERISTIC_UUID,
                          BLECharacteristic::PROPERTY_READ |
                          BLECharacteristic::PROPERTY_NOTIFY
                        );
  pSpO2Characteristic->addDescriptor(new BLE2902());
  pSpO2Service->start();
}
// Display screens
void showWelcomeScreen() {
  display.clearDisplay();

  // Draw borders (optional)
  display.drawRect(0, 0, 128, 64, WHITE);  // Border around the screen

  // SAARTHI in larger text, centered
  display.setTextSize(2);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds("SAARTHI", 0, 0, &x1, &y1, &w, &h);
  int centerX = (128 - w) / 2;
  display.setCursor(centerX, 8);
  display.print("SAARTHI");

  // Draw heart icons on both sides
  display.drawBitmap(2, 8, heart_icon, 16, 16, WHITE);
  display.drawBitmap(110, 8, heart_icon, 16, 16, WHITE);

  // Subtitle
  display.setTextSize(1);
  const char* subtitle = "Portable Health Monitor";
  display.getTextBounds(subtitle, 0, 0, &x1, &y1, &w, &h);
  centerX = (128 - w) / 2;
  display.setCursor(centerX, 35);
  display.print(subtitle);

  // Credits
  const char* credits = "by Kuldeep & Harshal";
  display.getTextBounds(credits, 0, 0, &x1, &y1, &w, &h);
  centerX = (128 - w) / 2;
  display.setCursor(centerX, 50);
  display.print(credits);

  display.display();
}

void updateDisplay() {
  display.clearDisplay();

  // Top status bar
  drawStatusBar();

  if (state.initError) {
    drawErrorScreen();
  } else if (state.ecgActive) {
    drawEcgScreen();
  } else if (state.vitalsActive) {
    drawVitalsScreen();
  } else {
    drawIdleScreen();
  }

  display.display();
}

void drawStatusBar() {
  // Draw top border line
  // display.drawFastHLine(0, 0, 128, WHITE);

  // Show play/pause icon based on connection status
  if (state.bleConnected) {
    display.drawBitmap(2, 2, play_icon, 16, 16, WHITE);
  } else {
    display.drawBitmap(2, 2, pause_icon, 16, 16, WHITE);
  }

  // SAARTHI text in center - ensure proper positioning
  display.setTextSize(1);
  display.setTextColor(WHITE);  // Explicitly set text color
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds("SAARTHI", 0, 0, &x1, &y1, &w, &h);  // Get text dimensions
  int centerX = (128 - w) / 2;  // Calculate center position
  display.setCursor(centerX, 4);
  display.print("SAARTHI");

  // Timer on right (if measuring)
  if (state.ecgActive || state.vitalsActive) {
    unsigned long elapsed = (millis() - state.measurementStartTime) / 1000;
    String timer = String(elapsed) + "s";
    display.setCursor(95, 4);
    display.print(timer);
  }

  // Bottom border of status bar
  // display.drawFastHLine(0, 16, 128, WHITE);
}

void drawErrorScreen() {
  // Center error icon
  display.drawBitmap(56, 24, error_icon, 16, 16, WHITE);

  display.setTextSize(1);
  display.setCursor(15, 45);
  display.print("Please restart device");
}

void drawEcgScreen() {
  // ECG title and icon
  display.drawBitmap(10, 20, ecg_icon, 16, 16, WHITE);
  display.setCursor(30, 24);
  display.print("ECG Recording");

  // ECG visualization
  int baseline = 45;
  for (int i = 0; i < state.ecgBufferIndex; i++) {
    int x = map(i, 0, ECG_BUFFER_SIZE, 0, SCREEN_WIDTH);
    int y = map(state.ecgBuffer[i], 0, 4095, baseline + 10, baseline - 10);
    display.drawPixel(x, y, WHITE);
  }
}
void drawVitalsScreen() {
  display.setTextSize(1);
  display.setTextColor(WHITE);  // Explicitly set text color

  // Heart Rate with icon
  display.drawBitmap(10, 20, heart_icon, 16, 16, WHITE);
  display.setCursor(30, 22);
  display.print("HR:    ");
  display.print(state.currentHeartRate, 0);
  display.print(" BPM");

  // SpO2 with icon
  display.drawBitmap(10, 34, spo2_icon, 16, 16, WHITE);
  display.setCursor(30, 35);
  display.print("SpO2:");
  display.print(state.currentSpO2);
  display.print("%");

  // Temperature with icon
  display.drawBitmap(10, 51, temp_icon, 16, 16, WHITE);
  display.setCursor(30, 51);
  display.print("Temp:");
  display.print(state.currentTemp, 1);
  display.print("  C");
 
  // Draw connecting lines between readings
  // display.drawFastHLine(10, 36, 108, WHITE);
  // display.drawFastHLine(10, 54, 108, WHITE);
}

void drawIdleScreen() {
  if (state.bleConnected) {
    // Ready to measure state
    display.drawBitmap(56, 24, play_icon, 16, 16, WHITE);
    display.setTextSize(1);
    display.setTextColor(WHITE);  // Explicitly set text color

    // Center the text
    int16_t x1, y1;
    uint16_t w, h;
    const char* text = "Connected, ready to monitor!";
    display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
    int centerX = (128 - w) / 2;
    display.setCursor(centerX, 45);
    display.print(text);
  } else {
    // Not connected state
    display.drawBitmap(56, 24, pause_icon, 16, 16, WHITE);
    display.setTextSize(1);
    display.setTextColor(WHITE);  // Explicitly set text color

    // Center the text
    int16_t x1, y1;
    uint16_t w, h;
    const char* text = "Connect bluetooth device!";
    display.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
    int centerX = (128 - w) / 2;
    display.setCursor(centerX, 45);
    display.print(text);
  }
}
void startAdvertising() {
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  // Add services to advertising
  pAdvertising->addServiceUUID(ECG_SERVICE_UUID);
  pAdvertising->addServiceUUID(HEART_RATE_SERVICE_UUID);
  pAdvertising->addServiceUUID(HEALTH_THERM_SERVICE_UUID);
  pAdvertising->addServiceUUID(SPO2_SERVICE_UUID);

  // Set advertising parameters
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // functions that help with iPhone connections issue
  pAdvertising->setMaxPreferred(0x12);

  BLEDevice::startAdvertising();
}

void handleEcgMeasurement() {
  unsigned long currentTime = millis();

  // Check if measurement period is complete
  if (currentTime - state.measurementStartTime >= ECG_MEASUREMENT_DURATION) {
    state.ecgActive = false;
    sendEcgBuffer();
    Serial.println("ECG measurement completed");
    return;
  }

  // Sample ECG
  if (currentTime - state.lastEcgReading >= ECG_SAMPLING_INTERVAL) {
    uint16_t ecgValue = analogRead(ECG_PIN);
    state.ecgBuffer[state.ecgBufferIndex++] = ecgValue;
    state.lastEcgReading = currentTime;

    if (state.ecgBufferIndex >= ECG_BUFFER_SIZE) {
      sendEcgBuffer();
    }
  }
}

void handleVitalsMeasurement() {
  unsigned long currentTime = millis();

  // Check if measurement period is complete
  if (currentTime - state.measurementStartTime >= VITALS_MEASUREMENT_DURATION) {
    state.vitalsActive = false;
    if (state.poxActive) {
      pox.shutdown();
      state.poxActive = false;
      Serial.println("Pulse oximeter shut down");
    }
    Serial.println("Vitals measurement completed");
    return;
  }

  // Update vitals
  if (currentTime - state.lastVitalsUpdate >= VITALS_UPDATE_INTERVAL) {
    updateVitals();
    state.lastVitalsUpdate = currentTime;
  }
}

void sendEcgBuffer() {
  if (state.ecgBufferIndex > 0 && state.bleConnected) {
    uint8_t buffer[ECG_BUFFER_SIZE * 2];
    for (int i = 0; i < state.ecgBufferIndex; i++) {
      buffer[i * 2] = state.ecgBuffer[i] & 0xFF;
      buffer[i * 2 + 1] = (state.ecgBuffer[i] >> 8) & 0xFF;
    }
    pEcgCharacteristic->setValue(buffer, state.ecgBufferIndex * 2);
    pEcgCharacteristic->notify();
    state.ecgBufferIndex = 0;
  }
}

void updateVitals() {
   pox.update();
  state.currentHeartRate = pox.getHeartRate();
  state.currentSpO2 = pox.getSpO2();
  state.currentTemp = mlx.readObjectTempC();

  if (state.bleConnected) {
    // Update heart rate
    uint8_t hrData = (uint8_t)state.currentHeartRate;
    pHeartRateCharacteristic->setValue(&hrData, 1);
    pHeartRateCharacteristic->notify();

    // Update SpO2
    pSpO2Characteristic->setValue(&state.currentSpO2, 1);
    pSpO2Characteristic->notify();

    // Update temperature
    uint32_t tempValue = state.currentTemp * 100;
    uint8_t tempBytes[4];
    memcpy(tempBytes, &tempValue, 4);
    pTempCharacteristic->setValue(tempBytes, 4);
    pTempCharacteristic->notify();
  }
}

void loop() {
  if (state.initError) {
    updateDisplay();
    delay(1000);
    return;
  }

  unsigned long currentTime = millis();

  // Update display periodically
  if (currentTime - state.lastDisplayUpdate >= DISPLAY_UPDATE_INTERVAL) {
    updateDisplay();
    state.lastDisplayUpdate = currentTime;
  }

  // Handle active measurements
  if (state.ecgActive) {
    handleEcgMeasurement();
  }

  if (state.vitalsActive) {
    handleVitalsMeasurement();
    debugMAX30100();
  }

  if (state.poxActive) {
    pox.update();
  }
}