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

    // End of telegram has not been reached.
    if (!eofRegexResult) {
      // Check if we've received another start of frame.
      // Some variants of the MT382 meters don't send an eof.
      // We skip the first byte, as this is already the sof of the current frame.
      // Note: add 1 to the index, as we skip the first byte when doing indexOf.
      const sofIndex = this.telegram.subarray(1).indexOf('/') + 1;

      if (sofIndex === 0) return;

      // Check if the characters before the sof char are newlines. Otherwise the sof
      // can be part of a text message element of a telegram.
      if (this.options.newLineChars === '\n' && sofIndex > 1) {
        const bytesBeforeSof = this.telegram.subarray(sofIndex - 1, sofIndex);

        // 0x0a is a newline character.
        if (bytesBeforeSof[0] !== 0x0a) {
          return;
        }
      } else if (sofIndex > 2) {
        const bytesBeforeSof = this.telegram.subarray(sofIndex - 2, sofIndex);

        // 0x0d is a carriage return and 0x0a is a newline character.
        if (bytesBeforeSof[0] !== 0x0d || bytesBeforeSof[1] !== 0x0a) {
          return;
        }
      }

      // Try to parse the data up to the start of the next frame.
      this.tryParseTelegram(sofIndex);

      return;
    }

    const endOfFrameIndex = eofRegexResult.index + eofRegexResult[0].length;

    this.tryParseTelegram(endOfFrameIndex);
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

  private tryParseTelegram(frameLength: number, overrideError?: Error) {
    // Clear the full frame required timeout. The full frame
    // has been received and the data buffer will be cleared.
    clearTimeout(this.fullFrameRequiredTimeout);

    try {
      const result = DSMRParser({
        telegram: this.telegram.subarray(0, frameLength),
        newLineChars: this.options.newLineChars,
      });

      this.options.callback(null, result);
    } catch (err) {
      const error = overrideError ?? err;
      if (error instanceof DSMRError) {
        error.withRawTelegram(this.telegram);
      }

      this.options.callback(error, undefined);
    }

    const remainingData = this.telegram.subarray(frameLength, this.telegram.length);
    this.hasStartOfFrame = false;
    this.telegram = Buffer.alloc(0);

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(remainingData);
    }
  }

  private onFullFrameRequiredTimeout() {
    this.tryParseTelegram(this.telegram.length, new DSMRTimeoutError());

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
