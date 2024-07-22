import type { DSMRParserOptions, DSMRParserResult } from '../index.js';
import { COSEM_PARSERS } from './cosem.js';

const validateCRC = (telegram: string, crc: number) => {

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

export const DSMR5Parser = (options: DSMRParserOptions): DSMRParserResult => {
  const lines = options.telegram.split(options.newlineChars === 'crlf' ? '\r\n' : '\n');

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
      console.log('End of telegram');
      result.crc = parseInt(line.slice(1, line.length), 16);
    } else if (line === '') {
      // skip empty lines
    } else {
      // Decode cosem object
      const lineParsed = decodeCOSEMObject(line, result, options)

      if (!lineParsed) {
        result.metadata.unknownLines = result.metadata.unknownLines ?? [];
        result.metadata.unknownLines.push(line);
      }
    }
  }

  if (options.checkCrc) {
    if (result.crc === undefined) {
      throw new Error('CRC is missing');
    }

    validateCRC(options.telegram, result.crc);
  }

  return result;
}