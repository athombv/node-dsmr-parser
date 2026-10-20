import type { SmartMeterParserResult } from '../index.js';

export const MBUS_DEVICE_IDS = {
  gas: 0x03,
  thermal: 0x04,
  water: 0x07,
} as const;

type MbusDeviceId = number | keyof typeof MBUS_DEVICE_IDS;

type MbusDevice = SmartMeterParserResult['mBus'][number] & { mBusId: string };

const resolveMbusDeviceId = (deviceId: MbusDeviceId) =>
  typeof deviceId === 'number' ? deviceId : MBUS_DEVICE_IDS[deviceId];

/**
 * Some meters announce a device type on an M-Bus channel that has no (or no longer a) meter
 * attached, e.g. an all-zero equipment ID without any reading. The channel still counts as a device
 * of that type, but a channel that actually carries a reading is far more useful to a consumer.
 * Score channels so the most complete one wins.
 */
const getMbusDeviceScore = (device: MbusDevice) => {
  let score = 0;

  if (typeof device.value === 'number' && Number.isFinite(device.value)) {
    score += 4;

    if (device.timestamp !== undefined) {
      score += 2;
    }
  }

  if (
    typeof device.equipmentId === 'string' &&
    device.equipmentId.length > 0 &&
    /[^0]/.test(device.equipmentId)
  ) {
    score += 1;
  }

  return score;
};

/** Returns all M-Bus devices of the given type, in channel order. */
export const getMbusDevices = (
  deviceId: MbusDeviceId,
  parsedData: SmartMeterParserResult,
): MbusDevice[] => {
  const id = resolveMbusDeviceId(deviceId);
  const devices: MbusDevice[] = [];

  for (const [mBusId, data] of Object.entries(parsedData.mBus)) {
    if (data.deviceType === id) {
      devices.push({
        ...data,
        mBusId,
      });
    }
  }

  return devices;
};

/**
 * Returns the M-Bus device of the given type. When multiple channels announce the same device type,
 * the channel with the most complete data (a reading, a timestamp and a usable equipment ID) is
 * preferred. Ties keep the first channel, so telegrams with a single device or with equally
 * complete devices behave exactly like before.
 */
export const getMbusDevice = (deviceId: MbusDeviceId, parsedData: SmartMeterParserResult) => {
  const devices = getMbusDevices(deviceId, parsedData);

  if (devices.length === 0) {
    return undefined;
  }

  let best = devices[0];
  let bestScore = getMbusDeviceScore(best);

  for (const device of devices.slice(1)) {
    const score = getMbusDeviceScore(device);

    if (score > bestScore) {
      best = device;
      bestScore = score;
    }
  }

  return best;
};
