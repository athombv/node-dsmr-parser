import { DSMR5Parser } from './parsers/dsmr.js';

export type DSMRParserOptions = {
  /** Raw DSMR telegram */
  telegram: string;
  /** Decryption key to decrypt the telegram (Only for Luxembourg) */
  decryptionKey?: string;
  /** Wether or not to check the CRC [default=true] */
  checkCrc?: boolean;
  /** Which parser to use */
  parser?: keyof typeof PARSERS;
  /** Which characters represent the newline */
  newlineChars?: 'crlf' | 'lf';
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
    deviceType?: number;
    equipmentId?: string;
    value?: number;
    unit?: string;
    timestamp?: string; // TODO: Parse to date object
  }>;
  crc?: number;
};

const PARSERS = {
  'default': DSMR5Parser,
} as const satisfies Record<string, (options: DSMRParserOptions) => DSMRParserResult>;

/**
 * Parse a DSMR telegram and return the parsed data.
 */
export const DSMRParser = (options: DSMRParserOptions) => {
  options.checkCrc = options.checkCrc ?? true;
  options.newlineChars = options.newlineChars ?? 'crlf';
  const parser = options.parser ?? 'default';

  if (!PARSERS[parser]) {
    throw new Error(`Invalid DSMR parser: ${parser}`);
  }

  return PARSERS[parser](options);
};