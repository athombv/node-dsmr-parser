import { PassThrough, Transform } from 'node:stream';
import {
  EncryptedDSMRStreamParser,
  DSMRStreamParser as DSMRStreamParserType,
  DSMRStreamParserOptions,
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
export const createDSMRStreamParser = (options: DSMRStreamParserOptions): DSMRStreamParserType => {
  if (options.decryptionKey) {
    return new EncryptedDSMRStreamParser(options);
  }

  return new UnencryptedDSMRStreamParser(options);
};

/** Create a DSMR stream transformer that reads data from a stream and pushes parsed telegrams. */
export const createDSMRStreamTransformer = (
  options: Omit<DSMRStreamParserOptions, 'callback' | 'stream'>,
) => {
  const passthrough = new PassThrough();

  const transformer = new Transform({
    objectMode: true,
    transform(chunk: Buffer, _encoding, callback) {
      passthrough.write(chunk);
      callback();
    },
  });

  const parser = createDSMRStreamParser({
    ...options,
    stream: passthrough,
    callback: (error, result) => {
      transformer.push({ error, result });
    },
  });

  transformer.on('close', () => {
    parser.destroy();
  });

  return transformer;
};
