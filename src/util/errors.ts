export class DSMRError extends Error {

}

export class DSMRParserError extends DSMRError {
  constructor(message: string) {
    super(message);
    this.name = 'DSMRParserError';
  }
}