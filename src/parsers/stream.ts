import { Readable } from 'node:stream';
import { type DSMRParserOptions, type DSMRParserResult } from '../index.js';
import { DSMRParser } from './dsmr.js';
import { decodeFooter, decryptFrameContents, decodeHeader, ENCRYPTED_DSMR_GCM_TAG_LEN, ENCRYPTED_DSMR_HEADER_LEN, ENCRYPTED_DSMR_TELEGRAM_SOF } from '../util/encryption.js';

export type DSMRStreamCallback = (error: unknown, result?: DSMRParserResult) => void;

export const EncryptedDsmrStreamParser = (stream: Readable, options: Omit<DSMRParserOptions, 'telegram'>, callback: DSMRStreamCallback) => {
  let hasStartOfFrame = false;
  let header: undefined | ReturnType<typeof decodeHeader> = undefined;
  let telegram = Buffer.alloc(0);
  
  const onData = (data: Buffer) => {
    if (!hasStartOfFrame) {
      const sofIndex = data.indexOf(ENCRYPTED_DSMR_TELEGRAM_SOF);
      
      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) return;
      
      telegram = data.subarray(sofIndex, data.length);
      hasStartOfFrame = true;
    } else {
      telegram = Buffer.concat([telegram, data]);
    }

    if (header === undefined && telegram.length >= ENCRYPTED_DSMR_HEADER_LEN) {
      header = decodeHeader(telegram);
    }

    // Wait for more data to decode the header
    if (!header) return;

    const totalLength = header.contentLength + ENCRYPTED_DSMR_GCM_TAG_LEN;

    // Wait until full telegram is received
    if (telegram.length < totalLength) return;

    try {
      const content = telegram.subarray(ENCRYPTED_DSMR_HEADER_LEN, header.contentLength);
      const footer = decodeFooter(telegram, header);
      const decrypted = decryptFrameContents({
        data: content,
        header,
        footer,
        key: options.decryptionKey ?? '',
        encoding: options.encoding ?? 'ascii',
      });
      const result = DSMRParser({
        telegram: decrypted,
        newLineChars: options.newLineChars,
      });

      callback(null, result);
    } catch (error) {
      callback(error, undefined);
    }

    hasStartOfFrame = false;
    header = undefined;
    const remainingData = telegram.subarray(totalLength, telegram.length);
    telegram = Buffer.alloc(0);
    
    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      onData(remainingData);
    }
  };

  stream.addListener('data', onData);

  return () => {
    stream.removeListener('data', onData);
  };
};

export const DefaultDSMRStreamParser = (stream: Readable, options: Omit<DSMRParserOptions, 'telegram'>, callback: DSMRStreamCallback) => {
  let telegram = '';
  let hasStartOfFrame = false;

  const onData = (dataRaw: Buffer) => {
    const data = dataRaw.toString();

    if (!hasStartOfFrame) {
      const sofIndex = data.indexOf('/');
      
      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) return;

      telegram = data.slice(sofIndex, data.length);
      hasStartOfFrame = true;
    } else {
      telegram += data.toString();
    }

    // End of frame is \r\n!<CRC>\r\n with the CRC being optional as
    // it is only for DSMR 4 and up.
    const eofRegex = /\r\n!([0-9A-Fa-f]+)?\r\n/;
    const regexResult = eofRegex.exec(telegram);

    // End of telegram has not been reached
    if (!regexResult) return;

    const endOfFrameIndex = regexResult.index + regexResult[0].length;

    try {
      const result = DSMRParser({
        telegram: telegram.slice(0, endOfFrameIndex),
        newLineChars: options.newLineChars,
      });

      callback(null, result);
    } catch (error) {
      callback(error, undefined);
    }

    hasStartOfFrame = false;
    const remainingData = telegram.slice(endOfFrameIndex, telegram.length);
    telegram = '';

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      onData(Buffer.from(remainingData));
    }
  };

  stream.addListener('data', onData);

  return () => {
    stream.removeListener('data', onData);
  }
};

/**
 * Create a DSMR stream parser that reads data from a stream and calls a callback when a telegram is parsed.
 * 
 * @param stream Stream to read data from
 * @param options Settings for parsing the DSMR data
 * @param callback Method that is called when a telegram is parsed or when an error occurred.
 * @returns Method to stop the stream parser.
 */
export const DSMRStreamParser = (stream: Readable, options: Omit<DSMRParserOptions, 'telegram'>, callback: DSMRStreamCallback) => {
  if (options.decryptionKey) {
    return EncryptedDsmrStreamParser(stream, options, callback);
  }

  return DefaultDSMRStreamParser(stream, options, callback);
};