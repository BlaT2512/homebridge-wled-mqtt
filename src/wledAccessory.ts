import mqtt, { MqttClient } from 'mqtt';
import { API, CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';

import { WLEDMQTTPlatform } from './platform';
import { hsvToRgb, rgbToHsv, rgbToHex, hexToRgb, rgbToColorTemperature, colorTemperatureToRgb } from './utils';

interface WLEDDevice {
  name: string;
  mqttBroker: string;
  mqttUsername?: string;
  mqttPassword?: string;
  mqttTopic: string;
  enableHistory?: boolean;
}

interface WLEDState {
  on: boolean;
  brightness: number; // 0-255
  color: { r: number; g: number; b: number };
  colorTemperature?: number; // mireds
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 */
export class WLEDAccessory {
  private service: Service;
  private informationService: Service;
  private mqttClient: MqttClient | null = null;
  private adaptiveLightingController: any = null; // AdaptiveLightingController from api.hap
  private currentState: WLEDState = {
    on: false,
    brightness: 255,
    color: { r: 255, g: 255, b: 255 },
  };
  private isUpdating = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: WLEDMQTTPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: WLEDDevice,
    private readonly api: API,
  ) {
    // Set accessory information
    this.informationService = this.accessory.getService(this.platform.Service.AccessoryInformation)!
      || this.accessory.addService(this.platform.Service.AccessoryInformation);

    this.informationService
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'WLED')
      .setCharacteristic(this.platform.Characteristic.Model, 'MQTT Controller')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.mqttTopic);

    // Get or create the Lightbulb service
    this.service = this.accessory.getService(this.platform.Service.Lightbulb)
      || this.accessory.addService(this.platform.Service.Lightbulb);

    // Set the service name
    this.service.setCharacteristic(this.platform.Characteristic.Name, device.name);

    // Register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    // Register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))
      .onGet(this.getBrightness.bind(this));

    // Register handlers for the Hue Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    // Register handlers for the Saturation Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this))
      .onGet(this.getSaturation.bind(this));

    // Register handlers for the ColorTemperature Characteristic (for Adaptive Lighting)
    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onSet(this.setColorTemperature.bind(this))
      .onGet(this.getColorTemperature.bind(this));

    // History is automatically enabled for characteristics that support it
    // No explicit configuration needed in homebridge-lib

    // Set up Adaptive Lighting Controller
    this.setupAdaptiveLighting();

    // Connect to MQTT
    this.connectMQTT();

    this.platform.log.info('WLED Accessory initialized:', device.name);
  }

  /**
   * Set up Adaptive Lighting support
   */
  private setupAdaptiveLighting() {
    try {
      // AdaptiveLightingController is available through api.hap
      const AdaptiveLightingController = this.api.hap.AdaptiveLightingController;
      if (AdaptiveLightingController) {
        this.adaptiveLightingController = new AdaptiveLightingController(this.service);

        this.accessory.configureController(this.adaptiveLightingController);
        this.platform.log.debug('Adaptive Lighting controller configured for', this.device.name);
      } else {
        this.platform.log.warn('AdaptiveLightingController not available in this Homebridge version');
      }
    } catch (error) {
      this.platform.log.warn('Failed to set up Adaptive Lighting:', error);
    }
  }

  /**
   * Connect to MQTT broker
   */
  private connectMQTT() {
    const options: mqtt.IClientOptions = {
      clientId: `homebridge-wled-${this.device.name}-${Date.now()}`,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    };

    if (this.device.mqttUsername) {
      options.username = this.device.mqttUsername;
    }
    if (this.device.mqttPassword) {
      options.password = this.device.mqttPassword;
    }

    this.platform.log.debug(`Connecting to MQTT broker: ${this.device.mqttBroker}`);

    try {
      this.mqttClient = mqtt.connect(this.device.mqttBroker, options);

      this.mqttClient.on('connect', () => {
        this.platform.log.info(`MQTT connected for ${this.device.name}`);
        this.subscribeToTopics();
      });

      this.mqttClient.on('error', (error) => {
        this.platform.log.error(`MQTT error for ${this.device.name}:`, error);
      });

      this.mqttClient.on('close', () => {
        this.platform.log.warn(`MQTT connection closed for ${this.device.name}`);
      });

      this.mqttClient.on('reconnect', () => {
        this.platform.log.debug(`MQTT reconnecting for ${this.device.name}`);
      });

      this.mqttClient.on('message', (topic, message) => {
        this.handleMQTTMessage(topic, message);
      });

      this.mqttClient.on('offline', () => {
        this.platform.log.warn(`MQTT offline for ${this.device.name}`);
      });
    } catch (error) {
      this.platform.log.error(`Failed to connect to MQTT for ${this.device.name}:`, error);
    }
  }

  /**
   * Subscribe to WLED MQTT topics
   */
  private subscribeToTopics() {
    if (!this.mqttClient) return;

    const baseTopic = this.device.mqttTopic;
    
    // Subscribe to state topics
    // WLED publishes state to: {topic}/g (brightness), {topic}/c (color), {topic}/status (online/offline)
    this.mqttClient.subscribe(`${baseTopic}/g`, (err) => {
      if (err) {
        this.platform.log.error(`Failed to subscribe to ${baseTopic}/g:`, err);
      } else {
        this.platform.log.debug(`Subscribed to ${baseTopic}/g`);
      }
    });

    this.mqttClient.subscribe(`${baseTopic}/c`, (err) => {
      if (err) {
        this.platform.log.error(`Failed to subscribe to ${baseTopic}/c:`, err);
      } else {
        this.platform.log.debug(`Subscribed to ${baseTopic}/c`);
      }
    });

    this.mqttClient.subscribe(`${baseTopic}/status`, (err) => {
      if (err) {
        this.platform.log.error(`Failed to subscribe to ${baseTopic}/status:`, err);
      } else {
        this.platform.log.debug(`Subscribed to ${baseTopic}/status`);
      }
    });

    // Request initial state
    this.publishMQTT(`${baseTopic}/api`, '{"v":true}');
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMQTTMessage(topic: string, message: Buffer) {
    const baseTopic = this.device.mqttTopic;
    const messageStr = message.toString();

    this.platform.log.debug(`MQTT message received on ${topic}: ${messageStr}`);

    this.isUpdating = true;

    try {
      if (topic === `${baseTopic}/g`) {
        // Brightness value (0-255)
        const brightness = parseInt(messageStr, 10);
        if (!isNaN(brightness) && brightness >= 0 && brightness <= 255) {
          this.currentState.brightness = brightness;
          this.currentState.on = brightness > 0;
          this.service.updateCharacteristic(this.platform.Characteristic.On, this.currentState.on);
          this.service.updateCharacteristic(
            this.platform.Characteristic.Brightness,
            Math.round((brightness / 255) * 100),
          );
        }
      } else if (topic === `${baseTopic}/c`) {
        // Color value (hex format like #FF0000)
        const rgb = hexToRgb(messageStr);
        if (rgb) {
          this.currentState.color = rgb;
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.service.updateCharacteristic(this.platform.Characteristic.Hue, hsv.h);
          this.service.updateCharacteristic(this.platform.Characteristic.Saturation, hsv.s);
          
          // If adaptive lighting is active and color changed from outside HomeKit (MQTT),
          // we must disable adaptive lighting as per documentation
          if (this.adaptiveLightingController?.isAdaptiveLightingActive()) {
            this.adaptiveLightingController.disableAdaptiveLighting();
            this.platform.log.debug(`Adaptive Lighting disabled for ${this.device.name} due to color change from MQTT`);
          }
          
          // Update color temperature to match the new color
          const mireds = rgbToColorTemperature(rgb.r, rgb.g, rgb.b);
          this.currentState.colorTemperature = mireds;
          this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, mireds);
        }
      } else if (topic === `${baseTopic}/status`) {
        // Status (online/offline)
        const isOnline = messageStr.toLowerCase() === 'online';
        if (!isOnline) {
          this.platform.log.warn(`${this.device.name} is offline`);
        }
      }
    } catch (error) {
      this.platform.log.error(`Error handling MQTT message for ${this.device.name}:`, error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Publish MQTT message
   */
  private publishMQTT(topic: string, message: string) {
    if (!this.mqttClient || !this.mqttClient.connected) {
      this.platform.log.warn(`MQTT not connected, cannot publish to ${topic}`);
      return;
    }

    this.platform.log.debug(`Publishing to ${topic}: ${message}`);
    this.mqttClient.publish(topic, message, { qos: 1, retain: false }, (error) => {
      if (error) {
        this.platform.log.error(`Failed to publish to ${topic}:`, error);
      }
    });
  }

  /**
   * Handle GET requests for On/Off
   */
  async getOn(): Promise<boolean> {
    return this.currentState.on;
  }

  /**
   * Handle SET requests for On/Off
   */
  async setOn(value: CharacteristicValue) {
    const boolValue = value as boolean;
    if (this.isUpdating) return;

    this.currentState.on = boolValue;
    const baseTopic = this.device.mqttTopic;

    if (boolValue) {
      // Turn on: set brightness to current brightness (or 255 if 0)
      const brightness = this.currentState.brightness > 0 ? this.currentState.brightness : 255;
      this.currentState.brightness = brightness;
      this.publishMQTT(baseTopic, brightness.toString());
    } else {
      // Turn off: set brightness to 0
      this.currentState.brightness = 0;
      this.publishMQTT(baseTopic, '0');
    }

    this.platform.log.debug(`Set ${this.device.name} On to ${boolValue}`);
  }

  /**
   * Handle GET requests for Brightness
   */
  async getBrightness(): Promise<number> {
    return Math.round((this.currentState.brightness / 255) * 100);
  }

  /**
   * Handle SET requests for Brightness
   */
  async setBrightness(value: CharacteristicValue) {
    const numValue = value as number;
    if (this.isUpdating) return;

    // Convert 0-100 to 0-255
    const brightness = Math.round((numValue / 100) * 255);
    this.currentState.brightness = brightness;
    this.currentState.on = brightness > 0;

    const baseTopic = this.device.mqttTopic;
    // Publish brightness to base topic (WLED master brightness)
    this.publishMQTT(baseTopic, brightness.toString());

    this.platform.log.debug(`Set ${this.device.name} Brightness to ${numValue}% (${brightness})`);
  }

  /**
   * Handle GET requests for Hue
   */
  async getHue(): Promise<number> {
    const hsv = rgbToHsv(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
    return hsv.h;
  }

  /**
   * Handle SET requests for Hue
   */
  async setHue(value: CharacteristicValue) {
    const numValue = value as number;
    if (this.isUpdating) return;

    const currentHsv = rgbToHsv(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
    const newRgb = hsvToRgb(numValue, currentHsv.s);
    
    // Update color without changing brightness
    this.currentState.color = newRgb;
    this.updateColor();

    this.platform.log.debug(`Set ${this.device.name} Hue to ${numValue}`);
  }

  /**
   * Handle GET requests for Saturation
   */
  async getSaturation(): Promise<number> {
    const hsv = rgbToHsv(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
    return hsv.s;
  }

  /**
   * Handle SET requests for Saturation
   */
  async setSaturation(value: CharacteristicValue) {
    const numValue = value as number;
    if (this.isUpdating) return;

    const currentHsv = rgbToHsv(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
    const newRgb = hsvToRgb(currentHsv.h, numValue);
    
    // Update color without changing brightness
    this.currentState.color = newRgb;
    this.updateColor();

    this.platform.log.debug(`Set ${this.device.name} Saturation to ${numValue}%`);
  }

  /**
   * Handle GET requests for ColorTemperature
   */
  async getColorTemperature(): Promise<number> {
    if (this.currentState.colorTemperature) {
      return this.currentState.colorTemperature;
    }
    // Calculate from current RGB
    return rgbToColorTemperature(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
  }

  /**
   * Handle SET requests for ColorTemperature
   */
  async setColorTemperature(value: CharacteristicValue) {
    const numValue = value as number;
    if (this.isUpdating) return;

    // Convert color temperature to RGB
    const rgb = colorTemperatureToRgb(numValue);
    this.currentState.color = rgb;
    this.currentState.colorTemperature = numValue;
    
    // Update color without changing brightness
    this.updateColor();

    // Update Hue and Saturation characteristics
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.service.updateCharacteristic(this.platform.Characteristic.Hue, hsv.h);
    this.service.updateCharacteristic(this.platform.Characteristic.Saturation, hsv.s);

    this.platform.log.debug(`Set ${this.device.name} ColorTemperature to ${numValue} mireds`);
  }

  /**
   * Update color on WLED device via MQTT
   */
  private updateColor() {
    const baseTopic = this.device.mqttTopic;
    const hexColor = rgbToHex(this.currentState.color.r, this.currentState.color.g, this.currentState.color.b);
    // Publish color to {topic}/col
    this.publishMQTT(`${baseTopic}/col`, hexColor);
  }

  /**
   * Clean up resources
   */
  public disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
