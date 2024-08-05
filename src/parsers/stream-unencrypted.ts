import { Readable } from 'stream';
import { DSMRStreamCallback, DSMRStreamParser, DSMRStreamParserOptions } from './stream-encrypted.js';
import { DSMRParser } from './dsmr.js';
import { DEFAULT_FRAME_ENCODING } from '../util/frame-validation.js';
import { DSMRStartOfFrameNotFoundError } from '../util/errors.js';

export class UnencryptedDSMRStreamParser implements DSMRStreamParser {

  private telegram = '';
  private hasStartOfFrame = false;
  private eofRegex: RegExp;

  constructor(
    private stream: Readable,
    private options: DSMRStreamParserOptions,
    private callback: DSMRStreamCallback,
  ) {
    this.stream.addListener('data', this.onData.bind(this));

    // End of frame is \r\n!<CRC>\r\n with the CRC being optional as
    // it is only for DSMR 4 and up.
    this.eofRegex = options.newLineChars === '\n'
      ? /\n!([0-9A-Fa-f]+)?\n/
      : /\r\n!([0-9A-Fa-f]+)?\r\n/;
  }

  private onData(dataRaw: Buffer) {
    const data = dataRaw.toString(this.options.encoding ?? DEFAULT_FRAME_ENCODING);

    if (!this.hasStartOfFrame) {
      const sofIndex = data.indexOf('/');
      
      // Not yet a valid frame. Discard the data
      if (sofIndex === -1) {
        this.callback(new DSMRStartOfFrameNotFoundError(), undefined);
        return;
      };

      this.telegram = data.slice(sofIndex, data.length);
      this.hasStartOfFrame = true;
    } else {
      this.telegram += data;
    }

    const regexResult = this.eofRegex.exec(this.telegram);

    // End of telegram has not been reached
    if (!regexResult) return;

    const endOfFrameIndex = regexResult.index + regexResult[0].length;

    try {
      const result = DSMRParser({
        telegram: this.telegram.slice(0, endOfFrameIndex),
        newLineChars: this.options.newLineChars,
      });

      this.callback(null, result);
    } catch (error) {
      this.callback(error, undefined);
    }

    const remainingData = this.telegram.slice(endOfFrameIndex, this.telegram.length);
    this.hasStartOfFrame = false;
    this.telegram = '';

    // There might be more data in the buffer for the next telegram.
    if (remainingData.length > 0) {
      this.onData(Buffer.from(remainingData, this.options.encoding ?? DEFAULT_FRAME_ENCODING));
    }
  }

  destroy() {
    this.stream.removeListener('data', this.onData.bind(this));
  }

  clear() {
    this.telegram = '';
    this.hasStartOfFrame = false;
  }

  currentSize() {
    return this.telegram.length;
  }
  
}