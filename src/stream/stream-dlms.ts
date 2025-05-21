import { Readable } from 'stream';
import {
  decodeHdlcFooter,
  decodeHdlcHeader,
  decodeLlcHeader,
  HDLC_FOOTER_LENGTH,
  HDLC_HEADER_LENGTH,
  HDLC_TELEGRAM_SOF_EOF,
  HdlcParserResult,
} from './../protocols/hdlc.js';
import {
  SmartMeterError,
  SmartMeterTimeoutError,
  StartOfFrameNotFoundError,
} from '../util/errors.js';
import { decodeDLMSContent, decodeDlmsObis } from './../protocols/dlms.js';
import { SmartMeterStreamCallback, SmartMeterStreamParser } from './stream.js';

export type DlmsStreamParserOptions = {
  stream: Readable;
  callback: SmartMeterStreamCallback<HdlcParserResult>;
  /** Decryption key */
  decryptionKey?: Buffer;
  /** AAD */
  additionalAuthenticatedData?: Buffer;
  /**
   * Maximum time in milliseconds to wait for a full frame to be received. The timer starts when a
   * valid start of frame/header is received.
   */
  fullFrameRequiredWithinMs?: number;
};

export class DlmsStreamParser implements SmartMeterStreamParser {
  public readonly startOfFrameByte = HDLC_TELEGRAM_SOF_EOF;

  private hasStartOfFrame = false;
  private fullFrameRequiredWithinMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;
  private telegram = Buffer.alloc(0);
  private cachedContent = Buffer.alloc(0);
  private header: ReturnType<typeof decodeHdlcHeader> | undefined = undefined;

  private readonly boundOnData = this.onData.bind(this);
  private readonly boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);

  constructor(private options: DlmsStreamParserOptions) {
    this.options.stream.addListener('data', this.boundOnData);

    this.fullFrameRequiredWithinMs = options.fullFrameRequiredWithinMs ?? 5000;
  }

  private onData(data: Buffer) {
    if (!this.hasStartOfFrame) {
      const sofIndex = data.indexOf(HDLC_TELEGRAM_SOF_EOF);

      if (sofIndex === -1) {
        const error = new StartOfFrameNotFoundError();
        error.withRawTelegram(data);

        this.options.callback(error, undefined);
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

    if (this.header === undefined && this.telegram.length >= HDLC_HEADER_LENGTH) {
      try {
        this.header = decodeHdlcHeader(this.telegram);
      } catch (error) {
        this.clear();

        if (error instanceof SmartMeterError) {
          error.withRawTelegram(this.telegram);
        }

        this.options.callback(error, undefined);

        const remainingData = this.telegram.subarray(1, this.telegram.length);
        this.hasStartOfFrame = false;
        this.header = undefined;
        this.telegram = Buffer.alloc(0);
        this.cachedContent = Buffer.alloc(0);

        // There might be more data in the buffer for the next telegram.
        if (remainingData.length > 0) {
          this.onData(remainingData);
        }
        return;
      }
    }

    // Wait for more data to decode the header
    if (!this.header) return;
    const totalLength = this.header.frameLength + 2; // 2 bytes for the sof and eof.

    if (this.telegram.length < totalLength) {
      return; // Wait for more data
    }

    if (this.header.segmentation) {
      // This frame is not complete yet, wait for more data.
      // TODO: Parse the footer and check the crc.
      this.cachedContent = Buffer.concat([
        this.cachedContent,
        this.telegram.subarray(this.header.consumedBytes, totalLength - HDLC_FOOTER_LENGTH),
      ]);

      const remainingData = this.telegram.subarray(totalLength, this.telegram.length);
      this.hasStartOfFrame = false;
      this.header = undefined;
      this.telegram = Buffer.alloc(0);

      // There might be more data in the buffer for the next telegram.
      if (remainingData.length > 0) {
        this.onData(remainingData);
      }

      return;
    }

    clearTimeout(this.fullFrameRequiredTimeout);

    try {
      const content = Buffer.concat([
        this.cachedContent,
        this.telegram.subarray(this.header.consumedBytes, totalLength - HDLC_FOOTER_LENGTH),
      ]); // Last two bytes of content are the footer

      const llc = decodeLlcHeader(content);

      const completeTelegram = this.telegram.subarray(0, totalLength);

      const footer = decodeHdlcFooter(completeTelegram);

      const dlmsContent = decodeDLMSContent({
        frame: content.subarray(llc.consumedBytes),
        decryptionKey: this.options.decryptionKey,
        additionalAuthenticatedData: this.options.additionalAuthenticatedData,
      });

      const result: HdlcParserResult = {
        hdlc: {
          raw: completeTelegram.toString('hex'),
          header: {
            destinationAddress: this.header.destinationAddress,
            sourceAddress: this.header.sourceAddress,
            crc: {
              value: this.header.crc,
              valid: this.header.crcValid,
            },
          },
          crc: {
            value: footer.crc,
            valid: footer.crcValid,
          },
        },
        // DLMS properties will be filled in by `decodeDlmsObis`
        dlms: {
          invokeId: 0,
          timestamp: '',
          unknownObjects: [],
          payloadType: '',
        },
        cosem: {
          unknownObjects: [],
          knownObjects: [],
        },
        electricity: {},
        mBus: {},
        metadata: {},
      };

      if (this.options.decryptionKey) {
        result.additionalAuthenticatedDataValid = dlmsContent.decryptionError === undefined;
      }

      decodeDlmsObis(dlmsContent, result);

      this.options.callback(null, result);
    } catch (error) {
      if (error instanceof SmartMeterError) {
        error.withRawTelegram(this.telegram);
      }

      this.options.callback(error, undefined);
    }

    const remainingData = this.telegram.subarray(totalLength, this.telegram.length);
    this.hasStartOfFrame = false;
    this.header = undefined;
    this.telegram = Buffer.alloc(0);
    this.cachedContent = Buffer.alloc(0);

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(remainingData);
    }
  }

  private onFullFrameRequiredTimeout() {
    const error = new SmartMeterTimeoutError();
    error.withRawTelegram(this.telegram);
    this.options.callback(error, undefined);

    // Reset the entire state here, as the full frame was not received.
    this.clear();
  }

  destroy(): void {
    this.options.stream.removeListener('data', this.boundOnData);
    this.clear();
  }

  clear(): void {
    clearTimeout(this.fullFrameRequiredTimeout);
    this.hasStartOfFrame = false;
    this.header = undefined;
    this.telegram = Buffer.alloc(0);
    this.cachedContent = Buffer.alloc(0);
  }

  currentSize(): number {
    return this.telegram.length + this.cachedContent.length;
  }
}
