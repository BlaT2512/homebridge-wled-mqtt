import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { WLEDAccessory } from './wledAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for the plugin
 */
export class WLEDMQTTPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired, it means Homebridge has restored all cached accessories
    // from disk. Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // Run the method to discover / register devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    // Add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    const devices = this.config.devices as Array<{
      name: string;
      mqttBroker: string;
      mqttUsername?: string;
      mqttPassword?: string;
      mqttTopic: string;
      enableHistory?: boolean;
    }>;

    if (!devices || !Array.isArray(devices)) {
      this.log.warn('No devices configured');
      return;
    }

    for (const device of devices) {
      // Validate required fields
      if (!device.name || !device.mqttBroker || !device.mqttTopic) {
        this.log.warn('Skipping device with missing required fields:', device);
        continue;
      }

      // Generate a unique id for the accessory
      const uuid = this.api.hap.uuid.generate(device.name + device.mqttTopic);

      // Check if the accessory already exists
      const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

      if (existingAccessory) {
        // The accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        // Update the accessory with the new device configuration
        new WLEDAccessory(this, existingAccessory, device);
      } else {
        // The accessory does not exist yet, so we need to create it
        this.log.info('Adding new accessory:', device.name);
        // Create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);
        // Store a copy of the device object in the `accessory.context`
        accessory.context.device = device;
        // Create the accessory handler
        new WLEDAccessory(this, accessory, device);
        // Link the accessory to the platform
        this.api.registerPlatformAccessories('homebridge-wled-mqtt', 'wled-mqtt', [accessory]);
        // Push into accessory array
        this.accessories.push(accessory);
      }
    }

    // Remove accessories that are no longer in the config
    const configuredUuids = devices
      .filter(d => d.name && d.mqttBroker && d.mqttTopic)
      .map(d => this.api.hap.uuid.generate(d.name + d.mqttTopic));

    const accessoriesToRemove = this.accessories.filter(
      acc => !configuredUuids.includes(acc.UUID),
    );

    if (accessoriesToRemove.length > 0) {
      this.log.info('Removing', accessoriesToRemove.length, 'orphaned accessories');
      this.api.unregisterPlatformAccessories('homebridge-wled-mqtt', 'wled-mqtt', accessoriesToRemove);
      accessoriesToRemove.forEach(acc => {
        const index = this.accessories.indexOf(acc);
        if (index > -1) {
          this.accessories.splice(index, 1);
        }
      });
    }
  }
}
