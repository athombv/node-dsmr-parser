import { SmartMeterError } from '../util/errors.js';
import { ObisCode, parseObisCodeFromBuffer } from './obis-code.js';

type DlmsDataTypeDecoder<T> = (index: number, buffer: Buffer) => { value: T; index: number };

export type DlmsDataTypes = {
  array: ParsedDlmsData[];
  structure: ParsedDlmsData[];
  octet_string: Buffer;
  string: string;
  uint8: number;
  uint16: number;
  uint32: number;
  int8: number;
  int16: number;
  int32: number;
  enum: number;
  null: null;
};

export type ParsedDlmsData<TName extends keyof DlmsDataTypes = keyof DlmsDataTypes> = {
  value: DlmsDataTypes[TName];
  type: TName;
};

export const isParsedDlmsDataType = <TName extends keyof DlmsDataTypes>(
  name: TName,
  value: ParsedDlmsData,
): value is ParsedDlmsData<TName> => {
  return name === value.type;
};

export const isDlmsStructureLike = (object: ParsedDlmsData) => {
  return isParsedDlmsDataType('structure', object) || isParsedDlmsDataType('array', object);
};

export const getDlmsNumberValue = (object: ParsedDlmsData) => {
  return typeof object.value === 'number' ? object.value : null;
};

export const isDlmsObisCode = (object: ParsedDlmsData) => {
  return isParsedDlmsDataType('octet_string', object) && object.value.length === 6;
};

export const getDlmsObisCode = (object: ParsedDlmsData): null | ObisCode => {
  if (!isParsedDlmsDataType('octet_string', object)) {
    return null;
  }

  const { obisCode } = parseObisCodeFromBuffer(object.value);

  return obisCode;
};

export const getDlmsObjectCount = (data: Buffer, index: number) => {
  let objectCount = data.readUint8(index++);

  if (objectCount > 0x80) {
    if (objectCount === 0x81) {
      objectCount = data.readUint8(index++);
    } else if (objectCount === 0x82) {
      objectCount = data.readUint16BE(index);
      index += 2;
    } else if (objectCount === 0x83) {
      objectCount = data.readUint32BE(index);
      index += 4;
    } else {
      throw new SmartMeterError(`Invalid object count 0x${objectCount.toString(16)}`);
    }
  }

  return {
    objectCount,
    newIndex: index,
  };
};

export type NestedStrings = string | NestedStrings[];

export function debugFriendlyDlmsDataType(object: ParsedDlmsData): NestedStrings {
  if (Array.isArray(object.value)) {
    return object.value.map(debugFriendlyDlmsDataType);
  }

  if (Buffer.isBuffer(object.value)) {
    return `${object.type}:${object.value.toString('hex')}`;
  }

  return `${object.type}:${object.value}`;
}

class DlmsDataTypesInternal {
  parsers = new Map<
    number,
    { name: keyof DlmsDataTypes; parse: DlmsDataTypeDecoder<DlmsDataTypes[keyof DlmsDataTypes]> }
  >();

  addDataType<TName extends keyof DlmsDataTypes>(
    name: TName,
    id: number,
    parse: DlmsDataTypeDecoder<DlmsDataTypes[TName]>,
  ) {
    this.parsers.set(id, { name, parse });
    return this;
  }

  parse(buffer: Buffer, index: number): ParsedDlmsData & { index: number } {
    if (index >= buffer.length) {
      return {
        value: null,
        index,
        type: 'null',
      };
    }

    const dataType = buffer.readUint8(index++);
    const parser = this.parsers.get(dataType);

    if (!parser) {
      throw new SmartMeterError(`Unknown data type 0x${dataType.toString(16)}`);
    }

    const { value, index: newIndex } = parser.parse(index, buffer);
    index = newIndex;

    return { value, index, type: parser.name };
  }
}

const parseStructureOrArray = (index: number, buffer: Buffer) => {
  const { objectCount, newIndex } = getDlmsObjectCount(buffer, index);
  index = newIndex;

  const resultValue: DlmsDataTypes['array'] = [];

  for (let i = 0; i < objectCount; i++) {
    const { value, index: newIndex, type } = DlmsDataTypes.parse(buffer, index);
    index = newIndex;
    resultValue.push({
      value,
      type,
    });
  }

  return {
    index,
    value: resultValue,
  };
};

// TODO: We need to add all data types, because otherwise
// we will get an error when we try to parse a data type we don't know.
/**
 * A DLMS data type is:
 *
 * - A tag
 * - A Length (only for some data types)
 * - The value (length is either determined by the tag and length)
 */
export const DlmsDataTypes = new DlmsDataTypesInternal()
  .addDataType('array', 0x01, parseStructureOrArray)
  .addDataType('structure', 0x02, parseStructureOrArray)
  .addDataType('octet_string', 0x09, (index, buffer) => {
    const { objectCount, newIndex } = getDlmsObjectCount(buffer, index);
    index = newIndex;
    const value = buffer.subarray(index, index + objectCount);
    index += objectCount;
    return {
      index,
      value,
    };
  })
  .addDataType('string', 0x0a, (index, buffer) => {
    const { objectCount, newIndex } = getDlmsObjectCount(buffer, index);
    index = newIndex;

    const value = buffer.subarray(index, index + objectCount).toString('utf-8');

    return {
      index: index + objectCount,
      value,
    };
  })
  .addDataType('uint8', 0x11, (index, buffer) => {
    const value = buffer.readUint8(index++);
    return {
      index,
      value,
    };
  })
  .addDataType('uint16', 0x12, (index, buffer) => {
    const value = buffer.readUint16BE(index);
    index += 2;
    return {
      index,
      value,
    };
  })
  .addDataType('uint32', 0x06, (index, buffer) => {
    const value = buffer.readUint32BE(index);
    index += 4;
    return {
      index,
      value,
    };
  })
  .addDataType('int8', 0x0f, (index, buffer) => {
    const value = buffer.readInt8(index);
    index += 1;
    return {
      index,
      value,
    };
  })
  .addDataType('int16', 0x10, (index, buffer) => {
    const value = buffer.readInt16BE(index);
    index += 2;
    return {
      index,
      value,
    };
  })
  .addDataType('int32', 0x05, (index, buffer) => {
    const value = buffer.readInt32BE(index);
    index += 4;
    return {
      index,
      value,
    };
  })
  .addDataType('enum', 0x16, (index, buffer) => {
    const value = buffer.readUint8(index++);
    return {
      value,
      index,
    };
  });
