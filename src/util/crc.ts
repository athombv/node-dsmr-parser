/**
 * Mirrors the bits of a number.
 *
 * E.g. for 0b00001111_00001100 it returns 0b001100_11110000.
 */
const reflectBits = (x: number, numBits: number) => {
  let r = 0;
  for (let i = 0; i < numBits; i++) {
    r = (r << 1) | (x & 1);
    x >>= 1;
  }
  return r;
};

/**
 * Creates a CRC16 function that can be used to calculate the CRC16 checksum for a given data
 * buffer.
 *
 * @note This method only works for CRC16 checksum that have RefIn=RefOut=true.
 */
const makeReflectedCrc16Function = ({
  polynomial,
  initial,
  xorOut,
}: {
  polynomial: number;
  initial: number;
  xorOut: number;
}) => {
  const inversePolynomial = reflectBits(polynomial, 16);

  return (data: Buffer) => {
    let crc = initial;

    for (const byte of data) {
      crc ^= byte;

      for (let i = 0; i < 8; i++) {
        if ((crc & 0x0001) !== 0) {
          crc = (crc >> 1) ^ inversePolynomial;
        } else {
          crc = crc >> 1;
        }
      }
    }

    return crc ^ xorOut;
  };
};

/**
 * Calculates the CRC16 checksum using CRC-16/ARC. Used for DSMR.
 *
 * {@link https://crccalc.com/?method=CRC-16/ARC}
 */
export const calculateCrc16Arc = makeReflectedCrc16Function({
  polynomial: 0x8005,
  initial: 0x0000,
  xorOut: 0x0000,
});

/**
 * Calculates the CRC16 checksum using CRC-16/IBM-SDLC. Used for HDLC.
 *
 * {@link https://crccalc.com/?method=CRC-16/IBM-SDLC}
 */
export const calculateCrc16IbmSdlc = makeReflectedCrc16Function({
  polynomial: 0x1021,
  initial: 0xffff,
  xorOut: 0xffff,
});
