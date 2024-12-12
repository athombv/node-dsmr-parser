import { Readable } from 'stream';
import {
  DSMRStreamCallback,
  DSMRStreamParser,
  DSMRStreamParserOptions,
} from './stream-encrypted.js';
import { DSMRParser } from './dsmr.js';
import {
  DEFAULT_FRAME_ENCODING,
  isAsciiFrame,
  isEncryptedFrame,
} from '../util/frame-validation.js';
import {
  DSMRDecodeError,
  DSMRDecryptionRequired,
  DSMRError,
  DSMRStartOfFrameNotFoundError,
} from '../util/errors.js';
import { ENCRYPTED_DSMR_HEADER_LEN, ENCRYPTED_DSMR_TELEGRAM_SOF } from '../util/encryption.js';

export class UnencryptedDSMRStreamParser implements DSMRStreamParser {
  private telegram: Buffer = Buffer.alloc(0);
  private hasStartOfFrame = false;
  private eofRegex: RegExp;
  private boundOnData: UnencryptedDSMRStreamParser['onData'];
  private detectEncryption: boolean;
  private encoding: BufferEncoding;

  constructor(
    private stream: Readable,
    private options: DSMRStreamParserOptions,
    private callback: DSMRStreamCallback,
  ) {
    this.boundOnData = this.onData.bind(this);
    this.stream.addListener('data', this.boundOnData);

    this.detectEncryption = options.detectEncryption ?? true;
    this.encoding = options.encoding ?? DEFAULT_FRAME_ENCODING;

    // End of frame is \r\n!<CRC>\r\n with the CRC being optional as
    // it is only for DSMR 4 and up.
    this.eofRegex =
      options.newLineChars === '\n' ? /\n!([0-9A-Fa-f]+)?\n(\0)?/ : /\r\n!([0-9A-Fa-f]+)?\r\n(\0)?/;
  }

  private onData(dataRaw: Buffer) {
    this.telegram = Buffer.concat([this.telegram, dataRaw]);

    // Detect encryption by checking if the header is present.
    if (this.detectEncryption) {
      const { isEncrypted, isAscii, requiresMoreData } = this.checkEncryption();

      if (requiresMoreData) return; // Wait for more data to arrive.

      if (isEncrypted) {
        const error = new DSMRDecryptionRequired();
        error.withRawTelegram(this.telegram);
        this.callback(error, undefined);
        this.telegram = Buffer.alloc(0);
        return;
      }

      if (!isAscii) {
        const error = new DSMRDecodeError('Invalid frame (not in ascii range)');
        error.withRawTelegram(this.telegram);
        this.callback(error, undefined);
        this.telegram = Buffer.alloc(0);
        return;
      }

      // If we get here, the frame is not encrypted and is in ascii range.
      // We can try parsing it as a normal DSMR frame.
    }

    if (!this.hasStartOfFrame) {
      const sofIndex = this.telegram.indexOf('/');

      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) {
        const error = new DSMRStartOfFrameNotFoundError();
        error.withRawTelegram(this.telegram);
        this.callback(error, undefined);
        this.telegram = Buffer.alloc(0);
        return;
      }

      this.telegram = this.telegram.subarray(sofIndex, this.telegram.length);
      this.hasStartOfFrame = true;
    }

    const eofRegexResult = this.eofRegex.exec(this.telegram.toString(this.encoding));

    // End of telegram has not been reached, wait for more data to arrive.
    if (!eofRegexResult) return;

    const endOfFrameIndex = eofRegexResult.index + eofRegexResult[0].length;

    try {
      const result = DSMRParser({
        telegram: this.telegram.subarray(0, endOfFrameIndex),
        newLineChars: this.options.newLineChars,
      });

      this.callback(null, result);
    } catch (error) {
      if (error instanceof DSMRError) {
        error.withRawTelegram(this.telegram);
      }

      this.callback(error, undefined);
    }

    const remainingData = this.telegram.subarray(endOfFrameIndex, this.telegram.length);
    this.hasStartOfFrame = false;
    this.telegram = Buffer.alloc(0);

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(remainingData);
    }
  }

  checkEncryption() {
    const encryptedSof = this.telegram.indexOf(ENCRYPTED_DSMR_TELEGRAM_SOF);

    if (encryptedSof === -1) {
      // There is no start of frame (for an encrypted frame) in the buffer.
      return {
        isEncrypted: false,
        isAscii: isAsciiFrame(this.telegram),
      };
    }

    // The header has a fixed length, so the telegram contain at least
    // ENCRYPTED_DSMR_HEADER_LEN bytes after the start of frame.
    const minimumTelegramLength = encryptedSof + ENCRYPTED_DSMR_HEADER_LEN;

    if (this.telegram.length < minimumTelegramLength) {
      return {
        requiresMoreData: true,
      };
    }

    return {
      isEncrypted: isEncryptedFrame(this.telegram),
      isAscii: isAsciiFrame(this.telegram),
    };
  }

  destroy() {
    this.stream.removeListener('data', this.boundOnData);
  }

  clear() {
    this.telegram = Buffer.alloc(0);
    this.hasStartOfFrame = false;
  }

  currentSize() {
    return this.telegram.length;
  }
}
