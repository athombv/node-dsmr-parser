import { decryptDlmsFrame } from './encryption.js';
import { SmartMeterParserError } from '../util/errors.js';
import { CosemLibrary } from './cosem.js';
import { parseObisCodeFromString } from './obis-code.js';
import { calculateCrc16Arc } from '../util/crc.js';
import { BaseParserResult } from '../util/base-result.js';

export type DsmrParserOptions =
  | {
      /** Raw DSMR telegram */
      telegram: string;
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
    };

export type DsmrParserResult = BaseParserResult & {
  dsmr: {
    header: {
      identifier: string;
      xxx: string;
      z: string;
    };
    unknownLines?: string[];
    crc?: {
      value: number;
      valid: boolean;
    };
  };
};

/** Parses a string like "(1234.56*unit)", "(1234.56)", "(1234)" or "()". */
const NumberTypeRegex = /^\(([\d.]+)?(\*\w+)?\)/;
/** Parses a string like "(string)". */
const StringTypeRegex = /^\(([^)]*)?\)/;

export const DSMR_SOF = 0x2f; // '/'
export const CR = 0x0d; // '\r'
export const LF = 0x0a; // '\n'
export const CRLF = '\r\n';

export const DEFAULT_FRAME_ENCODING = 'binary';

/**
 * CRC is a CRC16 value calculated over the preceding characters in the data message (from “/” to
 * “!” using the polynomial: x16+x15+x2+1). CRC16 uses no XOR in, no XOR out and is computed with
 * least significant bit first. The value is represented as 4 hexadecimal characters (MSB first).
 *
 * @param telegram
 * @param enteredCrc
 * @returns
 */
export const isDsmrCrcValid = ({ telegram, crc }: { telegram: string; crc: number }) => {
  // Strip the CRC from the telegram
  const telegramParts = telegram.split(`${CRLF}!`);
  const strippedTelegram = telegramParts[0] + CRLF + '!';

  const calculatedCrc = calculateCrc16Arc(Buffer.from(strippedTelegram, DEFAULT_FRAME_ENCODING));

  return calculatedCrc === crc;
};

const decodeDsmrCosemLine = ({
  line,
  lines,
  lineNumber,
  result,
}: {
  line: string;
  lines: string[];
  lineNumber: number;
  result: DsmrParserResult;
}) => {
  const { obisCode, consumedChars } = parseObisCodeFromString(line);

  if (obisCode === null) {
    result.dsmr.unknownLines = result.dsmr.unknownLines ?? [];
    result.dsmr.unknownLines.push(line);
    return false;
  }

  const parser = CosemLibrary.getParser(obisCode);

  if (!parser) {
    result.cosem.unknownObjects.push(line);
    return false;
  }

  const lineWithoutObisCode = line.slice(consumedChars, line.length);

  switch (parser.parameterType) {
    case 'string': {
      const regexResult = StringTypeRegex.exec(lineWithoutObisCode);

      if (!regexResult) {
        result.cosem.unknownObjects.push(line);
        return false;
      }
      result.cosem.knownObjects.push(line);

      const valueString = regexResult[1] ?? '';

      parser.callback({
        result,
        obisCode,
        valueString,
        dsmr: {
          line,
          lines,
          lineNumber,
        },
      });
      return true;
    }
    case 'number': {
      const regexResult = NumberTypeRegex.exec(lineWithoutObisCode);

      if (!regexResult) {
        result.cosem.unknownObjects.push(line);
        return false;
      }
      result.cosem.knownObjects.push(line);

      const valueString = regexResult[1] ?? '';
      const unit = regexResult[2] ? regexResult[2].slice(1) : null;
      let valueNumber = parseFloat(valueString);

      if (isNaN(valueNumber)) {
        valueNumber = 0;
      }

      parser.callback({
        result,
        obisCode,
        valueNumber,
        valueString,
        unit,
        dsmr: {
          line,
          lines,
          lineNumber,
        },
      });

      return true;
    }
    case 'raw': {
      result.cosem.knownObjects.push(line);
      parser.callback({
        result,
        obisCode,
        valueString: lineWithoutObisCode,
        dsmr: {
          line,
          lines,
          lineNumber,
        },
      });
      return true;
    }
    default: {
      return false;
    }
  }
};

/**
 * Parse a DSMR telegram into a structured object.
 *
 * @throws If CRC validation fails
 */
export const parseDsmr = (options: DsmrParserOptions): DsmrParserResult => {
  let telegram: string;
  let decryptError: Error | undefined;

  if (typeof options.telegram === 'string') {
    telegram = options.telegram;
  } else if (!Buffer.isBuffer(options.decryptionKey)) {
    telegram = options.telegram.toString(options.encoding ?? DEFAULT_FRAME_ENCODING);
  } else {
    const { content, error } = decryptDlmsFrame({
      data: options.telegram,
      key: options.decryptionKey,
      additionalAuthenticatedData: options.additionalAuthenticatedData,
    });

    telegram = content.toString(options.encoding ?? DEFAULT_FRAME_ENCODING);
    decryptError = error;
  }

  const lines = telegram.split(CRLF);

  const result: DsmrParserResult = {
    dsmr: {
      header: {
        identifier: '',
        xxx: '',
        z: '',
      },
    },
    cosem: {
      unknownObjects: [],
      knownObjects: [],
    },
    metadata: {},
    electricity: {},
    mBus: {},
  };

  if (!result.dsmr) throw new Error('Invalid State.');

  let objectsParsed = 0;

  for (const [lineNumber, line] of lines.entries()) {
    if (line.startsWith('/')) {
      // Beginning of telegram
      result.dsmr.header.xxx = line.slice(1, 4);
      result.dsmr.header.z = line.slice(4, 5);
      result.dsmr.header.identifier = line.slice(5, line.length);
    } else if (line.startsWith('!')) {
      // End of telegram
      if (line.length > 1) {
        result.dsmr.crc = {
          value: parseInt(line.slice(1, line.length), 16),
          valid: false,
        };
      }
    } else if (line === '' || line === '\0') {
      // skip empty lines
    } else {
      // Decode cosem object
      const isLineParsed = decodeDsmrCosemLine({
        result,
        line,
        lines,
        lineNumber,
      });

      if (isLineParsed) {
        objectsParsed++;
      }
    }
  }

  if (result.dsmr.crc !== undefined) {
    result.dsmr.crc.valid = isDsmrCrcValid({
      telegram,
      crc: result.dsmr.crc.value,
    });

    result.crcValid = result.dsmr.crc.valid;
  }

  if (objectsParsed === 0) {
    // If we're unable to parse the data and we have a decryption error,
    // the error is probably in the decryption.
    if (decryptError) {
      throw decryptError;
    }

    throw new SmartMeterParserError('Invalid telegram. No COSEM objects found.');
  }

  return result;
};
