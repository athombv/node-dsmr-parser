import { Readable } from 'node:stream';
import type { DSMRParserOptions, DSMRParserResult } from '../index.js';
import {
  decodeFooter,
  decodeHeader,
  decryptFrameContents,
  ENCRYPTED_DSMR_GCM_TAG_LEN,
  ENCRYPTED_DSMR_HEADER_LEN,
  ENCRYPTED_DSMR_TELEGRAM_SOF,
} from '../util/encryption.js';
import { DEFAULT_FRAME_ENCODING } from '../util/frame-validation.js';
import { DSMRParser } from './dsmr.js';
import { DSMRError, DSMRStartOfFrameNotFoundError, DSMRTimeoutError } from '../util/errors.js';

export type DSMRStreamParser = {
  /** Stop the stream parser. */
  destroy(): void;
  /** Clear all cached data */
  clear(): void;
  /** Size in bytes of the data that is cached */
  currentSize(): number;
};

export type DSMRStreamParserOptions = Omit<DSMRParserOptions, 'telegram'> & {
  /** Should the non-encrypted mode try to detect if the frame that is received is encrypted? */
  detectEncryption?: boolean;
  /**
   * Maximum time in milliseconds to wait for a full frame to be received. The timer starts when a
   * valid start of frame/header is received.
   */
  fullFrameRequiredWithinMs?: number;
};

export type DSMRStreamCallback = (error: unknown, result?: DSMRParserResult) => void;

export class EncryptedDSMRStreamParser implements DSMRStreamParser {
  private hasStartOfFrame = false;
  private header: ReturnType<typeof decodeHeader> | undefined = undefined;
  private telegram = Buffer.alloc(0);
  private fullFrameRequiredWithinMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;
  private boundOnData: EncryptedDSMRStreamParser['onData'];
  private boundOnFullFrameRequiredTimeout: EncryptedDSMRStreamParser['onFullFrameRequiredTimeout'];

  constructor(
    private stream: Readable,
    private options: DSMRStreamParserOptions,
    private callback: DSMRStreamCallback,
  ) {
    this.boundOnData = this.onData.bind(this);
    this.boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);

    this.stream.addListener('data', this.boundOnData);
    this.fullFrameRequiredWithinMs = options.fullFrameRequiredWithinMs ?? 5000;
  }

  private onData(data: Buffer) {
    if (!this.hasStartOfFrame) {
      const sofIndex = data.indexOf(ENCRYPTED_DSMR_TELEGRAM_SOF);

      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) {
        const error = new DSMRStartOfFrameNotFoundError();
        error.withRawTelegram(data);

        this.callback(error, undefined);
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

    if (this.header === undefined && this.telegram.length >= ENCRYPTED_DSMR_HEADER_LEN) {
      try {
        this.header = decodeHeader(this.telegram);
      } catch (error) {
        this.clear();

        if (error instanceof DSMRError) {
          error.withRawTelegram(this.telegram);
        }

        this.callback(error, undefined);
        return;
      }
    }

    // Wait for more data to decode the header
    if (!this.header) return;

    const totalLength = this.header.contentLength + ENCRYPTED_DSMR_GCM_TAG_LEN;

    // Wait until full telegram is received
    if (this.telegram.length < totalLength) return;

    clearTimeout(this.fullFrameRequiredTimeout);

    try {
      const content = this.telegram.subarray(ENCRYPTED_DSMR_HEADER_LEN, this.header.contentLength);
      const footer = decodeFooter(this.telegram, this.header);
      const decrypted = decryptFrameContents({
        data: content,
        header: this.header,
        footer,
        key: this.options.decryptionKey ?? '',
        encoding: this.options.encoding ?? DEFAULT_FRAME_ENCODING,
      });
      const result = DSMRParser({
        telegram: decrypted,
        newLineChars: this.options.newLineChars,
      });

      this.callback(null, result);
    } catch (error) {
      if (error instanceof DSMRError) {
        error.withRawTelegram(this.telegram);
      }

      this.callback(error, undefined);
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
    const error = new DSMRTimeoutError();
    error.withRawTelegram(this.telegram);
    this.callback(error, undefined);

    // Reset the entire state here, as the full frame was not received.
    this.clear();
  }

  destroy(): void {
    this.stream.removeListener('data', this.boundOnData);
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
