import { Readable } from 'node:stream';
import { DSMRParserOptions } from '../index.js';
import {
  DSMRStreamCallback,
  EncryptedDSMRStreamParser,
  DSMRStreamParser as DSMRStreamParserType,
} from './stream-encrypted.js';
import { UnencryptedDSMRStreamParser } from './stream-unencrypted.js';

/**
 * Create a DSMR stream parser that reads data from a stream and calls a callback when a telegram is
 * parsed.
 *
 * @param stream Stream to read data from
 * @param options Settings for parsing the DSMR data
 * @param callback Method that is called when a telegram is parsed or when an error occurred.
 * @returns Method to stop the stream parser.
 */
export const DSMRStreamParser = (
  stream: Readable,
  options: Omit<DSMRParserOptions, 'telegram'>,
  callback: DSMRStreamCallback,
): DSMRStreamParserType => {
  if (options.decryptionKey) {
    return new EncryptedDSMRStreamParser(stream, options, callback);
  }

  return new UnencryptedDSMRStreamParser(stream, options, callback);
};
