import { SmartMeterParserResult } from '../index.js';

export type SmartMeterStreamParser = {
  /** Stop the stream parser. */
  destroy(): void;
  /** Clear all cached data */
  clear(): void;
  /** Size in bytes of the data that is cached */
  currentSize(): number;
  /** The byte that indicates a start of frame was found for this parser */
  readonly startOfFrameByte: number;
};

export type SmartMeterStreamCallback<
  TResult extends SmartMeterParserResult = SmartMeterParserResult,
> = (error: unknown, result?: TResult) => void;
