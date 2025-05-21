export class SmartMeterError extends Error {
  rawTelegram?: Buffer;

  /** Optionally add the raw telegram that caused the error. */
  withRawTelegram(raw: Buffer) {
    this.rawTelegram = raw;
  }
}

export class SmartMeterParserError extends SmartMeterError {
  constructor(message: string) {
    super(message);
    this.name = 'SmartMeterParserError';
  }
}

export class SmartMeterDecryptionError extends SmartMeterError {
  constructor(originalError: unknown) {
    super('Decryption failed: ', { cause: originalError });
    this.name = 'DecryptionError';

    if (typeof originalError === 'string') {
      this.message += originalError;
    } else if (originalError instanceof Error) {
      this.message += originalError.message;
    } else {
      this.message += `Unknown error (${String(originalError)})`;
    }
  }
}

export class SmartMeterDecodeError extends SmartMeterError {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

export class StartOfFrameNotFoundError extends SmartMeterDecodeError {
  constructor() {
    super('Start of frame not found');
    this.name = 'StartOfFrameNotFoundError';
  }
}

export class SmartMeterDecryptionRequired extends SmartMeterDecodeError {
  constructor() {
    super('Encrypted frame detected');
    this.name = 'DecryptionRequired';
  }
}

export class SmartMeterTimeoutError extends SmartMeterDecodeError {
  constructor() {
    super('Timeout while waiting for full frame');
    this.name = 'TimeoutError';
  }
}

export class SmartMeterUnknownMessageTypeError extends SmartMeterError {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownMessageTypeError';
  }
}
