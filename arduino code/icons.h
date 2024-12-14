#ifndef ICONS_H
#define ICONS_H

// Play icon 16x16
const unsigned char play_icon [] PROGMEM = {
    0x00, 0x00, 0x00, 0x80, 0x01, 0xC0, 0x03, 0xE0, 0x07, 0xF0, 0x0F, 0xF8,
    0x1F, 0xFC, 0x3F, 0xFE, 0x3F, 0xFE, 0x1F, 0xFC, 0x0F, 0xF8, 0x07, 0xF0,
    0x03, 0xE0, 0x01, 0xC0, 0x00, 0x80, 0x00, 0x00
};

// Pause icon 16x16
const unsigned char pause_icon [] PROGMEM = {
    0x00, 0x00, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC,
    0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC,
    0x33, 0xCC, 0x33, 0xCC, 0x33, 0xCC, 0x00, 0x00
};

// Heart icon 16x16
const unsigned char heart_icon [] PROGMEM = {
    0x00, 0x00, 0x0C, 0x30, 0x12, 0x48, 0x21, 0x84, 0x41, 0x82, 0x41, 0x82,
    0x41, 0x82, 0x21, 0x84, 0x10, 0x08, 0x08, 0x10, 0x04, 0x20, 0x02, 0x40,
    0x01, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Temperature icon 16x16
const unsigned char temp_icon [] PROGMEM = {
    0x00, 0xE0, 0x01, 0x10, 0x01, 0x10, 0x01, 0x10, 0x01, 0x10, 0x01, 0x10,
    0x01, 0x10, 0x01, 0xD0, 0x01, 0xD0, 0x01, 0xD0, 0x01, 0xD0, 0x01, 0x50,
    0x01, 0x20, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00
};

// SpO2 icon 16x16
const unsigned char spo2_icon [] PROGMEM = {
    0x00, 0x00, 0x07, 0xE0, 0x08, 0x10, 0x13, 0xC8, 0x14, 0x28, 0x14, 0x28,
    0x13, 0xC8, 0x10, 0x08, 0x10, 0x08, 0x13, 0xC8, 0x14, 0x28, 0x14, 0x28,
    0x13, 0xC8, 0x08, 0x10, 0x07, 0xE0, 0x00, 0x00
};

// ECG wave icon 16x16
const unsigned char ecg_icon [] PROGMEM = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x40, 0x00, 0x40,
    0x00, 0x40, 0x01, 0x40, 0x01, 0x40, 0x06, 0x40, 0x18, 0x40, 0x00, 0x40,
    0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Error icon 16x16
const unsigned char error_icon [] PROGMEM = {
    0x00, 0x00, 0x07, 0xE0, 0x0F, 0xF0, 0x1F, 0xF8, 0x1C, 0x38, 0x19, 0x98,
    0x13, 0xC8, 0x17, 0xE8, 0x17, 0xE8, 0x13, 0xC8, 0x19, 0x98, 0x1C, 0x38,
    0x1F, 0xF8, 0x0F, 0xF0, 0x07, 0xE0, 0x00, 0x00
};

#endif
