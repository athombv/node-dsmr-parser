import type { DSMRParserOptions, DSMRParserResult } from '../index.js';
import { isCrcValid } from '../util/crc.js';
import { decryptFrame } from '../util/encryption.js';
import { DSMRParserError } from '../util/errors.js';
import { DEFAULT_FRAME_ENCODING } from '../util/frame-validation.js';
import { COSEM_PARSERS } from './cosem.js';

const decodeCOSEMObject = ({
  line,
  lines,
  lineNumber,
  result,
  options,
}: {
  line: string;
  lines: string[];
  lineNumber: number;
  result: DSMRParserResult;
  options: DSMRParserOptions;
}) => {
  for (const { regex, parser } of COSEM_PARSERS) {
    const regexResult = regex.exec(line);

    if (regexResult) {
      parser({
        regexResult,
        result,
        options,
        line,
        lines,
        lineNumber,
      });
      return true;
    }
  }

  return false;
};

/**
 * Parse a DSMR telegram into a structured object.
 *
 * @throws If CRC validation fails
 */
export const DSMRParser = (options: DSMRParserOptions): DSMRParserResult => {
  options.newLineChars = options.newLineChars ?? '\r\n';

  let telegram: string;

  if (typeof options.telegram === 'string') {
    telegram = options.telegram;
  } else if (typeof options.decryptionKey !== 'string') {
    telegram = options.telegram.toString(options.encoding ?? DEFAULT_FRAME_ENCODING);
  } else {
    telegram = decryptFrame({
      data: options.telegram,
      key: options.decryptionKey,
      encoding: options.encoding ?? DEFAULT_FRAME_ENCODING,
    });
  }

  const lines = telegram.split(options.newLineChars);

  const result: DSMRParserResult = {
    raw: telegram,
    header: {
      identifier: '',
      xxx: '',
      z: '',
    },
    metadata: {},
    electricity: {},
    mBus: {},
  };

  for (const [lineNumber, line] of lines.entries()) {
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
    } else if (line === '' || line === '\0') {
      // skip empty lines
    } else {
      // Decode cosem object
      const isLineParsed = decodeCOSEMObject({
        result,
        options,
        line,
        lines,
        lineNumber,
      });

      if (!isLineParsed) {
        result.metadata.unknownLines = result.metadata.unknownLines ?? [];
        result.metadata.unknownLines.push(line);
      }
    }
  }

  if (result.crc !== undefined) {
    result.crc.valid = isCrcValid({
      telegram,
      crc: result.crc.value,
      newLineChars: options.newLineChars,
    });
  }

  if (result.header.identifier === '' || result.header.xxx === '' || result.header.z === '') {
    throw new DSMRParserError('Invalid telegram. Missing header');
  }

  return result;
};
