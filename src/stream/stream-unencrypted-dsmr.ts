import { DSMRStreamParserOptions } from './stream-encrypted-dsmr.js';
import { CR, DEFAULT_FRAME_ENCODING, LF, parseDsmr } from './../protocols/dsmr.js';
import {
  SmartMeterError,
  StartOfFrameNotFoundError,
  SmartMeterTimeoutError,
  toSmartMeterError,
} from '../util/errors.js';
import { SmartMeterStreamParser } from './stream.js';

export class UnencryptedDSMRStreamParser implements SmartMeterStreamParser {
  private telegram: Buffer = Buffer.alloc(0);
  private hasStartOfFrame = false;
  private eofRegex: RegExp;
  private boundOnData: UnencryptedDSMRStreamParser['onData'];
  private boundOnFullFrameRequiredTimeout: UnencryptedDSMRStreamParser['onFullFrameRequiredTimeout'];
  private encoding: BufferEncoding;
  private fullFrameRequiredTimeoutMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;

  public readonly startOfFrameByte = 0x2f; // '/'

  constructor(private options: DSMRStreamParserOptions) {
    this.boundOnData = this.onData.bind(this);
    this.boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);
    this.options.stream.addListener('data', this.boundOnData);

    this.encoding = options.encoding ?? DEFAULT_FRAME_ENCODING;
    this.fullFrameRequiredTimeoutMs = options.fullFrameRequiredWithinMs ?? 5000;

    // End of frame is \r\n!<CRC>\r\n with the CRC being optional as
    // it is only for DSMR 4 and up.
    this.eofRegex = /\r\n!([0-9A-Fa-f]{4})?\r\n(\0)?/;
  }

  private onData(dataRaw: Buffer) {
    this.telegram = Buffer.concat([this.telegram, dataRaw]);

    if (!this.hasStartOfFrame) {
      const sofIndex = this.telegram.indexOf('/');

      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) {
        const error = new StartOfFrameNotFoundError();
        error.withRawTelegram(this.telegram);
        this.options.callback(error);
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
      if (sofIndex > 2) {
        const bytesBeforeSof = this.telegram.subarray(sofIndex - 2, sofIndex);

        // Check if the bytes before the start of frame are CRLF.
        if (bytesBeforeSof[0] !== CR || bytesBeforeSof[1] !== LF) {
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

  private tryParseTelegram(frameLength: number, overrideError?: Error) {
    // Clear the full frame required timeout. The full frame
    // has been received and the data buffer will be cleared.
    clearTimeout(this.fullFrameRequiredTimeout);

    try {
      const telegram = this.telegram.subarray(0, frameLength);
      const result = parseDsmr({
        telegram,
      });

      this.options.callback(null, result, telegram);
    } catch (err) {
      const error = overrideError ?? toSmartMeterError(err);

      if (error instanceof SmartMeterError) {
        error.withRawTelegram(this.telegram);
      }

      this.options.callback(error);
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
    this.tryParseTelegram(this.telegram.length, new SmartMeterTimeoutError());

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
