import { DSMRStreamParser, DSMRStreamParserOptions } from './stream-encrypted.js';
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
  DSMRTimeoutError,
} from '../util/errors.js';
import { ENCRYPTED_DSMR_HEADER_LEN, ENCRYPTED_DSMR_TELEGRAM_SOF } from '../util/encryption.js';

export class UnencryptedDSMRStreamParser implements DSMRStreamParser {
  private telegram: Buffer = Buffer.alloc(0);
  private hasStartOfFrame = false;
  private eofRegex: RegExp;
  private boundOnData: UnencryptedDSMRStreamParser['onData'];
  private boundOnFullFrameRequiredTimeout: UnencryptedDSMRStreamParser['onFullFrameRequiredTimeout'];
  private detectEncryption: boolean;
  private encoding: BufferEncoding;
  private fullFrameRequiredTimeoutMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;

  public readonly startOfFrameByte = 0x2f; // '/'

  constructor(private options: DSMRStreamParserOptions) {
    this.boundOnData = this.onData.bind(this);
    this.boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);
    this.options.stream.addListener('data', this.boundOnData);

    this.detectEncryption = options.detectEncryption ?? true;
    this.encoding = options.encoding ?? DEFAULT_FRAME_ENCODING;
    this.fullFrameRequiredTimeoutMs = options.fullFrameRequiredWithinMs ?? 5000;

    // End of frame is \r\n!<CRC>\r\n with the CRC being optional as
    // it is only for DSMR 4 and up.
    this.eofRegex =
      options.newLineChars === '\n' ? /\n!([0-9A-Fa-f]+)?\n(\0)?/ : /\r\n!([0-9A-Fa-f]+)?\r\n(\0)?/;
  }

  private onData(dataRaw: Buffer) {
    this.telegram = Buffer.concat([this.telegram, dataRaw]);

    // Detect encryption by checking if the header is present.
    if (this.detectEncryption && !this.hasStartOfFrame) {
      const { isEncrypted, isAscii, requiresMoreData } = this.checkEncryption();

      if (requiresMoreData) return; // Wait for more data to arrive.

      if (isEncrypted) {
        const error = new DSMRDecryptionRequired();
        error.withRawTelegram(this.telegram);
        this.options.callback(error, undefined);
        this.telegram = Buffer.alloc(0);
        return;
      }

      if (!isAscii) {
        const error = new DSMRDecodeError('Invalid frame (not in ascii range)');
        error.withRawTelegram(this.telegram);
        this.options.callback(error, undefined);
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
        this.options.callback(error, undefined);
        this.telegram = Buffer.alloc(0);
        return;
      }

      // Start a timeout within the full frame should be received.
      // If this isn't done, it could happen that the `telegram` grows indefinitely.
      this.fullFrameRequiredTimeout = setTimeout(
        this.boundOnFullFrameRequiredTimeout,
        this.fullFrameRequiredTimeoutMs,
      );
      this.telegram = this.telegram.subarray(sofIndex, this.telegram.length);
      this.hasStartOfFrame = true;
    }

    const eofRegexResult = this.eofRegex.exec(this.telegram.toString(this.encoding));

    // End of telegram has not been reached, wait for more data to arrive.
    if (!eofRegexResult) return;

    const endOfFrameIndex = eofRegexResult.index + eofRegexResult[0].length;

    // Clear the full frame required timeout. The full frame
    // has been received and the data buffer will be cleared.
    clearTimeout(this.fullFrameRequiredTimeout);

    try {
      const result = DSMRParser({
        telegram: this.telegram.subarray(0, endOfFrameIndex),
        newLineChars: this.options.newLineChars,
      });

      this.options.callback(null, result);
    } catch (error) {
      if (error instanceof DSMRError) {
        error.withRawTelegram(this.telegram);
      }

      this.options.callback(error, undefined);
    }

    const remainingData = this.telegram.subarray(endOfFrameIndex, this.telegram.length);
    this.hasStartOfFrame = false;
    this.telegram = Buffer.alloc(0);

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(remainingData);
    }
  }

  private checkEncryption() {
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

  private onFullFrameRequiredTimeout() {
    const error = new DSMRTimeoutError();
    error.withRawTelegram(this.telegram);
    this.options.callback(error, undefined);

    // Reset the entire state here, as the full frame was not received.
    this.clear();
  }

  destroy() {
    this.clear();
    this.options.stream.removeListener('data', this.boundOnData);
  }

  clear() {
    clearTimeout(this.fullFrameRequiredTimeout);
    this.telegram = Buffer.alloc(0);
    this.hasStartOfFrame = false;
  }

  currentSize() {
    return this.telegram.length;
  }
}
