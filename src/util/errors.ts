export class DSMRError extends Error {

}

export class DSMRParserError extends DSMRError {
  constructor(message: string) {
    super(message);
    this.name = 'DSMRParserError';
  }
}

export class DSMRDecryptionError extends DSMRError {
  constructor(originalError: unknown) {
    super('DSMR decryption failed: ');
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