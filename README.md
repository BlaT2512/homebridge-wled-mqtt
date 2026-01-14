# homebridge-wled-mqtt

Control WLED devices through MQTT with Homebridge and Apple Home. This plugin provides low-latency control of WLED LED strips using the MQTT protocol, with full support for color, brightness, and Adaptive Lighting.

## Features

- ✅ **Platform Plugin**: Support for multiple WLED devices
- ✅ **MQTT Integration**: Fast, low-latency control using MQTT protocol
- ✅ **Independent Brightness & Color Control**: Brightness changes use WLED's master brightness, color changes don't affect brightness
- ✅ **Full Color Support**: Access to the complete color spectrum using HSV model
- ✅ **Adaptive Lighting**: Full support for Apple HomeKit Adaptive Lighting
- ✅ **History Support**: Track on/off and brightness changes in Apple Home and Eve apps
- ✅ **Real-time State Sync**: Automatically syncs with WLED device state changes

## Why This Plugin?

This plugin was created to address specific needs that existing plugins couldn't meet:

- **homebridge-wled-ws**: Uses WebSockets which can be slower than MQTT
- **homebridge-mqttthing**: Changes RGB when adjusting brightness (uses HSV Value component)
- **homebridge-easy-mqtt**: Lacks built-in RGB color support

This plugin keeps HSV Value at 100% for color calculations and uses WLED's master brightness separately, ensuring you can achieve every possible color while maintaining independent brightness control.

## Installation

1. Install Homebridge if you haven't already: `npm install -g homebridge`
2. Install this plugin: `npm install -g homebridge-wled-mqtt`
3. Configure the plugin in Homebridge (see Configuration below)
4. Restart Homebridge

## Configuration

The plugin supports schema-based configuration through Homebridge's UI, or you can manually edit your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "wled-mqtt",
      "name": "WLED MQTT",
      "devices": [
        {
          "name": "WLED Desk",
          "mqttBroker": "mqtt://192.168.1.100:1883",
          "mqttUsername": "homebridge",
          "mqttPassword": "your_password",
          "mqttTopic": "wled/desk",
          "enableHistory": true
        }
      ]
    }
  ]
}
```

### Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Name of the WLED device as it will appear in HomeKit |
| `mqttBroker` | Yes | MQTT broker address (e.g., `mqtt://192.168.1.100:1883` or `mqtt://broker.local:1883`) |
| `mqttUsername` | No | MQTT broker username (if authentication is required) |
| `mqttPassword` | No | MQTT broker password (if authentication is required) |
| `mqttTopic` | Yes | Base MQTT topic for the WLED device (e.g., `wled/desk`) |
| `enableHistory` | No | Enable history tracking for on/off and brightness (default: `true`) |

### MQTT Topic Structure

The plugin uses WLED's standard MQTT topic structure:

- **Base Topic**: The topic you configure (e.g., `wled/desk`)
- **Brightness Control**: Publish brightness value (0-255) to base topic
- **Color Control**: Publish HEX color (e.g., `#FF0000`) to `{baseTopic}/col`
- **State Updates**: Subscribe to:
  - `{baseTopic}/g` - Current brightness (0-255)
  - `{baseTopic}/c` - Current color (HEX format)
  - `{baseTopic}/status` - Device online/offline status

## How It Works

### Brightness and Color Separation

This plugin implements a unique approach to brightness and color control:

1. **Color Changes**: When you change color in HomeKit, the plugin converts HSV to RGB with Value (brightness) always at 100%. This ensures the color is at full intensity.

2. **Brightness Changes**: When you adjust brightness in HomeKit, the plugin changes WLED's master brightness (0-255) without affecting the RGB color values.

This approach ensures:
- ✅ You can achieve every possible color
- ✅ Brightness and color adjustments are completely independent
- ✅ No color distortion when changing brightness

### Adaptive Lighting

The plugin fully supports Apple HomeKit Adaptive Lighting:

- Automatically adjusts color temperature throughout the day
- Works with HomeKit's built-in Adaptive Lighting feature
- Requires a Home Hub (Apple TV, HomePod, or iPad)

To enable Adaptive Lighting:
1. Open the Home app
2. Long-press on your WLED device
3. Tap "Adaptive Lighting" if available
4. The plugin will automatically handle color temperature adjustments

## Troubleshooting

### Device Not Appearing in HomeKit

- Check that your MQTT broker is accessible
- Verify the MQTT topic matches your WLED device configuration
- Check Homebridge logs for connection errors

### Color Not Changing

- Ensure your WLED device supports color control
- Check that the MQTT topic is correct
- Verify MQTT messages are being published (check Homebridge logs with debug mode)

### Brightness Not Working

- Verify WLED's master brightness is enabled
- Check MQTT connection status in logs
- Ensure the device is online (check `{topic}/status`)

### Adaptive Lighting Not Available

- Ensure you have a Home Hub configured
- Check that the device supports color temperature
- Try removing and re-adding the accessory

## Development

To build the plugin from source:

```bash
npm install
npm run build
```

To watch for changes during development:

```bash
npm run watch
```

## License

MIT

## Credits

This plugin was inspired by:
- [homebridge-wled-ws](https://github.com/smhex/homebridge-wled-ws) - WebSocket-based WLED plugin
- [homebridge-mqttthing](https://github.com/arachnetech/homebridge-mqttthing) - Generic MQTT plugin
- [WLED Project](https://github.com/Aircoookie/WLED) - The amazing WLED firmware
