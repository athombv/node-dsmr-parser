export const OBIS_WILDCARD = '*';
type ObisWildCard = typeof OBIS_WILDCARD;
type ObisWildCardOrNumber = ObisWildCard | number;

/**
 * OBIS (Object Identification System) is a standard for identifying objects in energy meters and
 * other devices. It uses a 6-byte code to represent different types of data, such as energy
 * consumption, voltage, current, etc. The code is divided into six groups, each represented by a
 * number. The first two groups are used to identify the type of data, while the last four groups
 * are used to identify the specific data point. The code is usually represented in the format
 * "A-B:C.D.E.F",
 *
 * In this case, we're not using the last byte (F) in our implementation, because DSMR skips it and
 * for the DLSM/Cosem code it is always 0xff.
 */
export type ObisCodeString =
  `${ObisWildCardOrNumber}-${ObisWildCardOrNumber}:${ObisWildCardOrNumber}.${ObisWildCardOrNumber}.${ObisWildCardOrNumber}`;
export type ObisCode = {
  media: number; // Value group a
  channel: number; // Value group b
  physical: number; // Value group c
  type: number; // Value group d
  processing: number; // Value group e
  history: number; // Value group f (not used in DSMR, and 0xff (N/A) in DLMS)
};
export type ObisCodeWildcard = {
  [key in keyof ObisCode]: ObisCode[key] | ObisWildCard;
};

/** Parses a string like "1-2:3.4.5" */
const OBISIdentifierRegex = /^(\d{1,3})-(\d{1,3}):(\d{1,3})\.(\d{1,3})\.(\d{1,3})/;
/** Parses a string like "1-2:3.4.5", and allows using "*" as a wildcard. */
const OBISIdentifierRegexWithWildcards =
  /^(\d{1,3}|\*)-(\d{1,3}|\*):(\d{1,3}|\*)\.(\d{1,3}|\*)\.(\d{1,3}|\*)/;

export const obisCodeToString = (obisCode: ObisCode): ObisCodeString => {
  return `${obisCode.media}-${obisCode.channel}:${obisCode.physical}.${obisCode.type}.${obisCode.processing}`;
};

export const parseObisCodeFromString = (
  str: string,
): {
  obisCode: ObisCode | null;
  consumedChars: number;
} => {
  const match = OBISIdentifierRegex.exec(str);

  if (!match) {
    return {
      obisCode: null,
      consumedChars: 0,
    };
  }

  return {
    obisCode: {
      media: parseInt(match[1], 10),
      channel: parseInt(match[2], 10),
      physical: parseInt(match[3], 10),
      type: parseInt(match[4], 10),
      processing: parseInt(match[5], 10),
      history: 0xff,
    },
    consumedChars: match[0].length,
  };
};

export const parseObisCodeFromBuffer = (
  buffer: Buffer,
): {
  obisCode: ObisCode | null;
} => {
  if (buffer.length !== 6) {
    return { obisCode: null };
  }

  return {
    obisCode: {
      media: buffer[0],
      channel: buffer[1],
      physical: buffer[2],
      type: buffer[3],
      processing: buffer[4],
      history: buffer[5],
    },
  };
};

export const parseObisCodeWithWildcards = (
  str: string,
): {
  obisCode: ObisCodeWildcard | null;
  consumedChars: number;
} => {
  const match = OBISIdentifierRegexWithWildcards.exec(str);

  if (!match) {
    return {
      obisCode: null,
      consumedChars: 0,
    };
  }

  return {
    obisCode: {
      media: match[1] === OBIS_WILDCARD ? OBIS_WILDCARD : parseInt(match[1], 10),
      channel: match[2] === OBIS_WILDCARD ? OBIS_WILDCARD : parseInt(match[2], 10),
      physical: match[3] === OBIS_WILDCARD ? OBIS_WILDCARD : parseInt(match[3], 10),
      type: match[4] === OBIS_WILDCARD ? OBIS_WILDCARD : parseInt(match[4], 10),
      processing: match[5] === OBIS_WILDCARD ? OBIS_WILDCARD : parseInt(match[5], 10),
      history: OBIS_WILDCARD,
    },
    consumedChars: match[0].length,
  };
};

export const isEqualObisCode = (codeA: ObisCodeWildcard, codeB: ObisCodeWildcard) => {
  if (
    codeA.media !== OBIS_WILDCARD &&
    codeB.media !== OBIS_WILDCARD &&
    codeA.media !== codeB.media
  ) {
    return false;
  }

  if (
    codeA.channel !== OBIS_WILDCARD &&
    codeB.channel !== OBIS_WILDCARD &&
    codeA.channel !== codeB.channel
  ) {
    return false;
  }

  if (
    codeA.physical !== OBIS_WILDCARD &&
    codeB.physical !== OBIS_WILDCARD &&
    codeA.physical !== codeB.physical
  ) {
    return false;
  }

  if (codeA.type !== OBIS_WILDCARD && codeB.type !== OBIS_WILDCARD && codeA.type !== codeB.type) {
    return false;
  }

  if (
    codeA.processing !== OBIS_WILDCARD &&
    codeB.processing !== OBIS_WILDCARD &&
    codeA.processing !== codeB.processing
  ) {
    return false;
  }

  return true;
};
