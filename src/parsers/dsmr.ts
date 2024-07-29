import type { DSMRParserOptions, DSMRParserResult } from '../index.js';
import { COSEM_PARSERS } from './cosem.js';

/**
 * CRC is a CRC16 value calculated over the preceding characters in the data message (from “/” to “!” using the polynomial: x16+x15+x2+1). CRC16 uses no XOR in, no XOR out and is computed with least significant bit first. The value is represented as 4 hexadecimal charac- ters (MSB first).
 * @param telegram 
 * @param enteredCrc 
 * @returns 
 */
const isCRCValid = (telegram: string, enteredCrc: number, options: DSMRParserOptions) => {
  // Because the CRC is always calculated over the telegram that is using
  // crlf as newline characters, we need to replace the newline characters
  // in the telegram with crlf before calculating the CRC.
  telegram = telegram.replace(/\r?\n/g, '\r\n');
  
  // Strip the CRC from the telegram
  const crcSplit = `\r\n!`;
  const telegramParts = telegram.split(crcSplit);
  const strippedTelegram = telegramParts[0] + crcSplit;
  const telegramBytes = Buffer.from(strippedTelegram, 'ascii');

  let calculatedCrc = 0;

  for (const byte of telegramBytes) {
    calculatedCrc ^= byte;

    for (let i = 0; i < 8; i++) {
      if ((calculatedCrc & 0x0001) !== 0) {
        // 0xA001 is the reversed polynomial used for this CRC.
        calculatedCrc = (calculatedCrc >> 1) ^ 0xA001;
      } else {
        calculatedCrc = calculatedCrc >> 1;
      }
    }
  }

  return calculatedCrc === enteredCrc;
};

const decodeCOSEMObject = (line: string, result: DSMRParserResult, options: DSMRParserOptions) => {
  for (const { regex, parser } of COSEM_PARSERS) {
    const regexResult = regex.exec(line);

    if (regexResult) {
      parser(regexResult, result, options);
      return true;
    }
  }

  return false;
}

/**
 * Parse a DSMR telegram into a structured object.
 * @throws If CRC validation fails
 */
export const DSMRParser = (options: DSMRParserOptions): DSMRParserResult => {
  options.newLineChars = options.newLineChars ?? '\r\n';
  
  const lines = options.telegram.split(options.newLineChars);

  const result: DSMRParserResult = {
    header: {
      identifier: '',
      xxx: '',
      z: '',
    },
    metadata: {},
    electricity: {},
    mBus: {},
  };

  for (const line of lines) {
    if (line.startsWith('/')) {
      // Beginning of telegram
      result.header.xxx = line.slice(1, 4);
      result.header.z = line.slice(4, 5);
      result.header.identifier = line.slice(5, line.length);
    } else if (line.startsWith('!')) {
      // End of telegram
      if (line.length > 1) {
        result.crc = {
          value: parseInt(line.slice(1, line.length), 16),
          valid: false,
        };
      }
    } else if (line === '') {
      // skip empty lines
    } else {
      // Decode cosem object
      const isLineParsed = decodeCOSEMObject(line, result, options)

      if (!isLineParsed) {
        result.metadata.unknownLines = result.metadata.unknownLines ?? [];
        result.metadata.unknownLines.push(line);
      }
    }
  }

  if (result.crc !== undefined) {
    result.crc.valid = isCRCValid(options.telegram, result.crc.value, options);
  }

  return result;
}