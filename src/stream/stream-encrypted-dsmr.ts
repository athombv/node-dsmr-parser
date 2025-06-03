import { Readable } from 'node:stream';
import {
  decodeEncryptionFooter,
  decodeEncryptionHeader,
  decryptFrameContents,
  ENCRYPTED_DLMS_GCM_TAG_LEN,
  ENCRYPTED_DLMS_HEADER_LEN,
  ENCRYPTED_DLMS_TELEGRAM_SOF,
} from '../protocols/encryption.js';
import { DsmrParserOptions, DsmrParserResult, parseDsmr } from './../protocols/dsmr.js';
import {
  SmartMeterError,
  StartOfFrameNotFoundError,
  SmartMeterTimeoutError,
  toSmartMeterError,
} from '../util/errors.js';
import { SmartMeterStreamCallback, SmartMeterStreamParser } from './stream.js';

export type DSMRStreamParserOptions = Omit<DsmrParserOptions, 'telegram'> & {
  /** The stream which is going to provide the data */
  stream: Readable;
  /** The callback that will be called when a telegram was parsed. */
  callback: SmartMeterStreamCallback<DsmrParserResult>;
  /**
   * Maximum time in milliseconds to wait for a full frame to be received. The timer starts when a
   * valid start of frame/header is received.
   */
  fullFrameRequiredWithinMs?: number;
  /** Data that is already available in the stream when the parser is created. */
  initialData?: Buffer;
};

export class EncryptedDSMRStreamParser implements SmartMeterStreamParser {
  private hasStartOfFrame = false;
  private header: ReturnType<typeof decodeEncryptionHeader> | undefined = undefined;
  private telegram = Buffer.alloc(0);
  private fullFrameRequiredWithinMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;
  private boundOnData: EncryptedDSMRStreamParser['onData'];
  private boundOnFullFrameRequiredTimeout: EncryptedDSMRStreamParser['onFullFrameRequiredTimeout'];

  public readonly startOfFrameByte = ENCRYPTED_DLMS_TELEGRAM_SOF;

  constructor(private options: DSMRStreamParserOptions) {
    this.boundOnData = this.onData.bind(this);
    this.boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);

    this.options.stream.addListener('data', this.boundOnData);
    this.fullFrameRequiredWithinMs = options.fullFrameRequiredWithinMs ?? 5000;

    if (this.options.initialData) {
      this.onData(this.options.initialData);
    }
  }

  private onData(data: Buffer) {
    if (!this.hasStartOfFrame) {
      const sofIndex = data.indexOf(ENCRYPTED_DLMS_TELEGRAM_SOF);

      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) {
        const error = new StartOfFrameNotFoundError();
        error.withRawTelegram(data);

        this.options.callback(error);
        return;
      }

      this.fullFrameRequiredTimeout = setTimeout(
        this.boundOnFullFrameRequiredTimeout,
        this.fullFrameRequiredWithinMs,
      );
      this.telegram = data.subarray(sofIndex, data.length);
      this.hasStartOfFrame = true;
    } else {
      this.telegram = Buffer.concat([this.telegram, data]);
    }

    if (this.header === undefined && this.telegram.length >= ENCRYPTED_DLMS_HEADER_LEN) {
      try {
        this.header = decodeEncryptionHeader(this.telegram);
      } catch (err) {
        const error = toSmartMeterError(err);
        error.withRawTelegram(this.telegram);
        this.clear();

        this.options.callback(error);
        return;
      }
    }

    // Wait for more data to decode the header
    if (!this.header) return;

    const totalLength =
      ENCRYPTED_DLMS_HEADER_LEN + this.header.contentLength + ENCRYPTED_DLMS_GCM_TAG_LEN;

    // Wait until full telegram is received
    if (this.telegram.length < totalLength) return;

    clearTimeout(this.fullFrameRequiredTimeout);

    let decryptError: Error | undefined;

    try {
      const telegram = this.telegram.subarray(0, totalLength);
      const encryptedContent = telegram.subarray(
        ENCRYPTED_DLMS_HEADER_LEN,
        ENCRYPTED_DLMS_HEADER_LEN + this.header.contentLength,
      );
      const footer = decodeEncryptionFooter(this.telegram, this.header);

      const { content, error } = decryptFrameContents({
        data: encryptedContent,
        header: this.header,
        footer,
        key: this.options.decryptionKey ?? Buffer.alloc(0),
        additionalAuthenticatedData: this.options.additionalAuthenticatedData,
      });

      decryptError = error;

      const result = parseDsmr({
        telegram: content,
      });

      result.additionalAuthenticatedDataValid = decryptError === undefined;

      this.options.callback(null, result, telegram);
    } catch (error) {
      // If we had a decryption error that is the cause of the error.
      // So that should be returned to the listener.
      const realError = decryptError ?? toSmartMeterError(error);

      if (realError instanceof SmartMeterError) {
        realError.withRawTelegram(this.telegram);
      }

      this.options.callback(realError);
    }

    const remainingData = this.telegram.subarray(totalLength, this.telegram.length);

    this.hasStartOfFrame = false;
    this.header = undefined;
    this.telegram = Buffer.alloc(0);

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(remainingData);
    }
  }

  private onFullFrameRequiredTimeout() {
    const error = new SmartMeterTimeoutError();
    error.withRawTelegram(this.telegram);
    this.options.callback(error);

    // Reset the entire state here, as the full frame was not received.
    this.clear();
  }

  destroy(): void {
    this.options.stream.removeListener('data', this.boundOnData);
  }

  clear(): void {
    clearTimeout(this.fullFrameRequiredTimeout);
    this.hasStartOfFrame = false;
    this.header = undefined;
    this.telegram = Buffer.alloc(0);
  }

  currentSize() {
    return this.telegram.length;
  }
}
