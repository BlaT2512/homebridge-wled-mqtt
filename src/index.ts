import { API } from 'homebridge';

import { WLEDMQTTPlatform } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform('homebridge-wled-mqtt', 'wled-mqtt', WLEDMQTTPlatform);
};
