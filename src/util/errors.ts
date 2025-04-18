export class DSMRError extends Error {
  rawTelegram?: Buffer;

  /** Optionally add the raw telegram that caused the error. */
  withRawTelegram(raw: Buffer) {
    this.rawTelegram = raw;
  }
}

export class DSMRParserError extends DSMRError {
  constructor(message: string) {
    super(message);
    this.name = 'DSMRParserError';
  }
}

export class DSMRDecryptionError extends DSMRError {
  constructor(originalError: unknown) {
    super('DSMR decryption failed: ', { cause: originalError });
    this.name = 'DSMRDecryptionError';

    if (typeof originalError === 'string') {
      this.message += originalError;
    } else if (originalError instanceof Error) {
      this.message += originalError.message;
    } else {
      this.message += `Unknown error (${String(originalError)})`;
    }
  }
}

export class DSMRDecodeError extends DSMRError {
  constructor(message: string) {
    super(message);
    this.name = 'DSMRDecodeError';
  }
}

export class DSMRStartOfFrameNotFoundError extends DSMRDecodeError {
  constructor() {
    super('Start of frame not found');
    this.name = 'DSMRStartOfFrameNotFoundError';
  }
}

export class DSMRDecryptionRequired extends DSMRDecodeError {
  constructor() {
    super('Encrypted DSMR frame detected');
    this.name = 'DSMRDecryptionRequired';
  }
}

export class DSMRTimeoutError extends DSMRDecodeError {
  constructor() {
    super('Timeout while waiting for full frame');
    this.name = 'DSMRTimeoutError';
  }
}
