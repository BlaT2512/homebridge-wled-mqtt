import type { API } from 'homebridge';

import { WLEDMQTTPlatform } from './platform';
import { PLATFORM_NAME } from './settings';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, WLEDMQTTPlatform);
};