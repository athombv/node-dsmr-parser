import { DSMRParser } from './parsers/dsmr.js';
import { getMbusDevice, MBUS_DEVICE_IDS } from './parsers/mbus.js';
import { createDSMRStreamParser, createDSMRStreamTransformer } from './parsers/stream.js';
import { ENCRYPTION_DEFAULT_AAD } from './util/encryption.js';
import { DSMRFrameValid } from './util/frame-validation.js';

export type DSMRParserOptions =
  | {
      /** Raw DSMR telegram */
      telegram: string;
      /** New line characters */
      newLineChars?: '\r\n' | '\n';
      /** Enable the encryption detection mechanism. Enabled by default */
      decryptionKey?: never;
      additionalAuthenticatedData?: never;
      encoding?: never;
    }
  | {
      /** Encrypted DSMR telegram */
      telegram: Buffer;
      /** Decryption key */
      decryptionKey?: Buffer;
      /** AAD */
      additionalAuthenticatedData?: Buffer;
      /** Encoding of the data in the buffer, defaults to binary */
      encoding?: BufferEncoding;
      /** New line characters */
      newLineChars?: '\r\n' | '\n';
    };

export type DSMRParserResult = {
  raw: string;
  header: {
    identifier: string;
    xxx: string;
    z: string;
  };
  metadata: {
    dsmrVersion?: number;
    timestamp?: string; // TODO make this a date object
    equipmentId?: string;
    events?: {
      powerFailures?: number;
      longPowerFailures?: number;
      voltageSags?: {
        l1?: number;
        l2?: number;
        l3?: number;
      };
      voltageSwells?: {
        l1?: number;
        l2?: number;
        l3?: number;
      };
    };
    unknownLines?: string[];
    textMessage?: string;
    numericMessage?: number;
  };
  electricity: {
    total?: {
      received?: number;
      returned?: number;
    };
    tariffs?: Partial<Record<number, { received?: number; returned?: number }>>;
    currentTariff?: number;
    voltage?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    current?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    powerReturnedTotal?: number;
    powerReturned?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
    powerReceivedTotal?: number;
    powerReceived?: {
      l1?: number;
      l2?: number;
      l3?: number;
    };
  };
  mBus: Record<
    number,
    {
      deviceType?: number; // TODO: Parse to device type?
      equipmentId?: string;
      value?: number;
      unit?: string;
      timestamp?: string; // TODO: Parse to date object
      recordingPeriodMinutes?: number; // DSMR
    }
  >;
  crc?: {
    value: number;
    valid: boolean;
  };
  /** Only set when encryption is used */
  additionalAuthenticatedDataValid?: boolean;
};

export * from './util/errors.js';

export const DSMR = {
  parse: DSMRParser,
  createStreamParser: createDSMRStreamParser,
  createStreamTransformer: createDSMRStreamTransformer,
  isValidFrame: DSMRFrameValid,
  MBUS_DEVICE_IDS,
  getMbusDevice,
  ENCRYPTION_DEFAULT_AAD,
} as const;
