import type { SmartMeterParserResult } from '../index.js';

export const MBUS_DEVICE_IDS = {
  gas: 0x03,
  thermal: 0x04,
  water: 0x07,
} as const;

export const getMbusDevice = (
  deviceId: number | keyof typeof MBUS_DEVICE_IDS,
  parsedData: SmartMeterParserResult,
) => {
  const id = typeof deviceId === 'number' ? deviceId : MBUS_DEVICE_IDS[deviceId];

  for (const [mBusId, data] of Object.entries(parsedData.mBus)) {
    if (data.deviceType === id) {
      return {
        ...data,
        mBusId,
      };
    }
  }

  return undefined;
};
