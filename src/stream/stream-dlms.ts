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
  toSmartMeterError,
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
  /**
   * Data that is already available in the stream when the parser is created.
   */
  initialData?: Buffer;
};

export class DlmsStreamParser implements SmartMeterStreamParser {
  public readonly startOfFrameByte = HDLC_TELEGRAM_SOF_EOF;

  private hasStartOfFrame = false;
  private fullFrameRequiredWithinMs: number;
  private fullFrameRequiredTimeout?: NodeJS.Timeout;
  private telegram = Buffer.alloc(0);
  private cachedContent = Buffer.alloc(0);
  private header: ReturnType<typeof decodeHdlcHeader> | undefined = undefined;
  private headers: ReturnType<typeof decodeHdlcHeader>[] = [];
  private footers: ReturnType<typeof decodeHdlcFooter>[] = [];
  private telegrams: Buffer[] = [];

  private readonly boundOnData = this.onData.bind(this);
  private readonly boundOnFullFrameRequiredTimeout = this.onFullFrameRequiredTimeout.bind(this);

  constructor(private options: DlmsStreamParserOptions) {
    this.options.stream.addListener('data', this.boundOnData);

    this.fullFrameRequiredWithinMs = options.fullFrameRequiredWithinMs ?? 5000;

    if (this.options.initialData) {
      this.onData(this.options.initialData);
    }
  }

  private onData(data: Buffer) {
    if (!this.hasStartOfFrame) {
      const sofIndex = data.indexOf(HDLC_TELEGRAM_SOF_EOF);

      if (sofIndex === -1) {
        const error = new StartOfFrameNotFoundError();
        error.withRawTelegram(data);

        this.options.callback(error);
        return;
      }

      // The timeout can be already started when we're parsing
      // segmented HDLC frames.
      if (!this.fullFrameRequiredTimeout) {
        this.fullFrameRequiredTimeout = setTimeout(
          this.boundOnFullFrameRequiredTimeout,
          this.fullFrameRequiredWithinMs,
        );
      }
      this.telegram = data.subarray(sofIndex, data.length);
      this.hasStartOfFrame = true;
    } else {
      this.telegram = Buffer.concat([this.telegram, data]);
    }

    if (this.header === undefined && this.telegram.length >= HDLC_HEADER_LENGTH) {
      try {
        this.header = decodeHdlcHeader(this.telegram);
        this.headers.push(this.header);
      } catch (rawError) {
        const error = toSmartMeterError(rawError);

        if (error instanceof SmartMeterError) {
          error.withRawTelegram(this.telegram);
        }

        this.options.callback(error);

        this.clear();
        return;
      }
    }

    // Wait for more data to decode the header
    if (!this.header) return;

    // +2 bytes for the sof and eof which are not included in the frame length field in the header
    const totalLength = this.header.frameLength + 2;

    if (this.telegram.length < totalLength) {
      return; // Wait for more data
    }

    // A complete HDLC frame is available now.
    const fullHdlcFrame = this.telegram.subarray(0, totalLength);
    const footer = decodeHdlcFooter(fullHdlcFrame);
    this.footers.push(footer);

    const frameContent = this.telegram.subarray(
      this.header.consumedBytes,
      totalLength - HDLC_FOOTER_LENGTH,
    );
    this.cachedContent = Buffer.concat([this.cachedContent, frameContent]);

    const telegram = this.telegram.subarray(0, totalLength);
    this.telegrams.push(telegram);

    // If the frame is segmented, the content is split over multiple HDLC frames.
    if (this.header.segmentation) {
      // This frame is not complete yet, wait for more data.
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

    // We now have the complete contents. We can parse the DLMS content.
    clearTimeout(this.fullFrameRequiredTimeout);
    this.fullFrameRequiredTimeout = undefined;

    try {
      const llc = decodeLlcHeader(this.cachedContent);

      const dlmsContent = decodeDLMSContent({
        frame: this.cachedContent.subarray(llc.consumedBytes),
        decryptionKey: this.options.decryptionKey,
        additionalAuthenticatedData: this.options.additionalAuthenticatedData,
      });

      let allCrcValid = true;

      const result: HdlcParserResult = {
        hdlc: {
          headers: this.headers.map((header) => {
            if (!header.crcValid) {
              allCrcValid = false;
            }

            return {
              destinationAddress: header.destinationAddress,
              sourceAddress: header.sourceAddress,
              crc: {
                valid: header.crcValid,
                value: header.crc,
              },
            };
          }),
          footers: this.footers.map((footer) => {
            if (!footer.crcValid) {
              allCrcValid = false;
            }

            return {
              crc: {
                valid: footer.crcValid,
                value: footer.crc,
              },
            };
          }),
          crc: {
            valid: allCrcValid,
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

      this.options.callback(null, result, Buffer.concat(this.telegrams));
    } catch (rawError) {
      const error = toSmartMeterError(rawError);
      if (error instanceof SmartMeterError) {
        error.withRawTelegram(this.telegram);
      }

      this.options.callback(error);
    }

    const remainingData = this.telegram.subarray(totalLength, this.telegram.length);
    this.clear();

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
    this.clear();
  }

  clear(): void {
    clearTimeout(this.fullFrameRequiredTimeout);
    this.fullFrameRequiredTimeout = undefined;
    this.hasStartOfFrame = false;
    this.header = undefined;
    this.headers = [];
    this.footers = [];
    this.telegrams = [];
    this.telegram = Buffer.alloc(0);
    this.cachedContent = Buffer.alloc(0);
  }

  currentSize(): number {
    return this.telegram.length + this.telegrams.reduce((acc, t) => acc + t.length, 0);
  }
}
