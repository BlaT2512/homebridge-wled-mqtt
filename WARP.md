# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

A Homebridge platform plugin that enables control of WLED LED strips via MQTT protocol. The plugin provides HomeKit integration with support for color, brightness, and Apple's Adaptive Lighting feature.

**Key Distinction**: This plugin separates brightness and color control by keeping HSV Value at 100% for color calculations while using WLED's master brightness separately. This ensures all colors are achievable without distortion when adjusting brightness.

## Development Commands

### Building
```bash
npm run build          # Compile TypeScript to dist/
npm run watch          # Compile in watch mode for development
```

### Linting
```bash
npm run lint           # Run ESLint on TypeScript source files
```

### Testing
No test suite is currently configured. The `npm test` command will exit with an error.

### Publishing
```bash
npm run prepublishOnly # Automatically runs build before publishing
```

## Architecture

### Core Components

**Platform (`src/platform.ts`)**
- Entry point: `WLEDMQTTPlatform` implements Homebridge's `DynamicPlatformPlugin`
- Responsible for device discovery and accessory lifecycle management
- Reads device configurations from Homebridge config and creates/restores accessories
- Handles orphaned accessory cleanup when devices are removed from config

**Accessory (`src/wledAccessory.ts`)**
- `WLEDAccessory` class: One instance per configured WLED device
- Manages MQTT connection to a single WLED device
- Implements HomeKit characteristic handlers (On/Off, Brightness, Hue, Saturation, ColorTemperature)
- Handles bidirectional state sync: HomeKit → MQTT (commands) and MQTT → HomeKit (state updates)
- Integrates `AdaptiveLightingController` from HAP-nodejs for dynamic color temperature

**Utilities (`src/utils.ts`)**
- Color space conversions: HSV ↔ RGB ↔ Hex
- Color temperature conversions: Mireds ↔ RGB (Kelvin)
- **Critical**: `hsvToRgb()` always sets Value to 100% to preserve color integrity

### MQTT Integration

**Topic Structure** (based on WLED's standard topics):
- **Base topic**: User-configured (e.g., `wled/desk`)
- **Commands**:
  - `{topic}` - Publish brightness (0-255) to control master brightness
  - `{topic}/col` - Publish hex color (e.g., `#FF0000`)
- **State subscriptions**:
  - `{topic}/g` - Current brightness (0-255)
  - `{topic}/c` - Current color (hex format)
  - `{topic}/status` - Device online/offline status

**State Management**:
- `isUpdating` flag prevents feedback loops between MQTT state updates and HomeKit characteristic handlers
- State updates from MQTT automatically sync to HomeKit characteristics
- MQTT client handles automatic reconnection (5s reconnect period)

### Brightness & Color Separation Logic

1. **Color changes** (Hue/Saturation): Convert HSV to RGB with V=100%, publish to `{topic}/col`
2. **Brightness changes**: Publish brightness value to base topic (WLED master brightness)
3. **Adaptive Lighting**: Sets ColorTemperature characteristic, which converts mireds → RGB → publishes color

This approach ensures brightness and color remain independent without color distortion.

## Configuration

Devices are configured via Homebridge's `config.json` under a platform with alias `wled-mqtt`. The plugin uses `config.schema.json` for UI-based configuration in Homebridge's web interface.

Required fields per device:
- `name`: Device name in HomeKit
- `mqttBroker`: MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`)
- `mqttTopic`: Base topic for WLED device

Optional fields:
- `mqttUsername`, `mqttPassword`: MQTT authentication
- `enableHistory`: Enable history tracking (default: true)

## TypeScript Configuration

- Target: ES2021
- Module: CommonJS
- Strict mode enabled
- Output directory: `dist/`
- Source maps and declarations generated

## Plugin Registration

The plugin registers with Homebridge using:
- Plugin name: `homebridge-wled-mqtt`
- Platform alias: `wled-mqtt`
- Entry point: `src/index.ts` exports registration function

## Adaptive Lighting Implementation

Uses HAP-nodejs's `AdaptiveLightingController`:
- Configured per accessory with unique controller ID (accessory UUID)
- Handles ColorTemperature characteristic automatically
- When active, color temperature changes are converted to RGB and published via MQTT
- Requires HomeKit Home Hub for activation
