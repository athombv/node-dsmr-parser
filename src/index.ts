export type DSMRParserOptions = {
  /** Raw DSMR telegram */
  telegram: string;
  /** New line characters */
  newLineChars?: '\r\n' | '\n';
  decryptionKey?: never;
  encoding?: never;
} | {
  /** Encrypted DSMR telegram */
  telegram: Buffer;
  /** Decryption key */
  decryptionKey?: string;
  /** Encoding of the data in the buffer, defaults to ascii */
  encoding?: BufferEncoding;
  /** New line characters */
  newLineChars?: '\r\n' | '\n';
};

export type DSMRParserResult = {
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
    tariff1?: {
      received?: number;
      returned?: number;
    };
    tariff2?: {
      received?: number;
      returned?: number;
    };
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
  mBus: Record<number, {
    deviceType?: number; // TODO: Parse to device type?
    equipmentId?: string;
    value?: number;
    unit?: string;
    timestamp?: string; // TODO: Parse to date object
  }>;
  crc?: {
    value: number;
    valid: boolean;
  };
};


export { MBUS_DEVICE_IDS, getMbusDevice } from './parsers/mbus.js'
export { DSMRParser } from './parsers/dsmr.js';
export { DSMRStreamParser } from './parsers/stream.js';
export { DSMRFrameValid } from './util/frame-validation.js';
export * from './util/errors.js';
