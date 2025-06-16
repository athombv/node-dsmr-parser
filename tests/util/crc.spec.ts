import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateCrc16Arc, calculateCrc16IbmSdlc } from '../../src/util/crc.js';

describe('CRC', () => {
  describe('CRC-16/ARC', () => {
    // Note: these cases have been verified using https://crccalc.com/
    const CRC_TESTS = [
      {
        input: 'Hello, world!',
        output: 0x9a4a,
      },
      {
        input: '',
        output: 0x0000,
      },
      {
        input: '123456789',
        output: 0xbb3d,
      },
      {
        input: 'The quick brown fox jumps over the lazy dog',
        output: 0xfcdf,
      },
      {
        input: 'Lorem ipsum dolor sit amet',
        output: 0xc14f,
      },
    ];

    for (const test of CRC_TESTS) {
      it(`Calculates the CRC of "${test.input}"`, () => {
        const buf = Buffer.from(test.input);
        const crc = calculateCrc16Arc(buf);
        assert.equal(crc, test.output);
      });
    }
  });

  describe('CRC-16/IBM-SDLC', () => {
    // Note: these cases have been verified using https://crccalc.com/
    const CRC_TESTS = [
      {
        input: 'Hello, world!',
        output: 0x1eb5,
      },
      {
        input: '',
        output: 0x0000,
      },
      {
        input: '123456789',
        output: 0x906e,
      },
      {
        input: 'The quick brown fox jumps over the lazy dog',
        output: 0x9358,
      },
      {
        input: 'Lorem ipsum dolor sit amet',
        output: 0x7ff8,
      },
    ];

    for (const test of CRC_TESTS) {
      it(`Calculates the CRC of "${test.input}"`, () => {
        const buf = Buffer.from(test.input);
        const crc = calculateCrc16IbmSdlc(buf);
        assert.equal(crc, test.output);
      });
    }
  });
});
