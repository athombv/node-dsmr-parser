import { getMbusDevice, MBUS_DEVICE_IDS } from './util/mbus.js';
import { ENCRYPTED_DLMS_DEFAULT_AAD } from './protocols/encryption.js';
import { DsmrParserResult } from './protocols/dsmr.js';
import { HdlcParserResult } from './protocols/hdlc.js';

export type SmartMeterParserResult = DsmrParserResult | HdlcParserResult;

export * from './util/errors.js';

export const DSMR = {
  MBUS_DEVICE_IDS,
  getMbusDevice,
  ENCRYPTION_DEFAULT_AAD: ENCRYPTED_DLMS_DEFAULT_AAD,
} as const;

export { EncryptedDSMRStreamParser } from './stream/stream-encrypted-dsmr.js';
export { UnencryptedDSMRStreamParser } from './stream/stream-unencrypted-dsmr.js';
export { DlmsStreamParser } from './stream/stream-dlms.js';
