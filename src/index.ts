export type DSMRParserOptions = {
  /** Raw DSMR telegram */
  telegram: string;
  /** Decryption key to decrypt the telegram (Only for Luxembourg) */
  decryptionKey?: string;
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

export { DSMRParser } from './parsers/dsmr.js';