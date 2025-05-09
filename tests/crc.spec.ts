import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateCrc16, isCrcValid } from '../src/util/crc.js';

describe('CRC', () => {
  describe('CRC16', () => {
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
        const crc = calculateCrc16(buf);
        assert.equal(crc, test.output);
      });
    }
  });

  describe('Telegrams', () => {
    it('Marks valid CRCs as valid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isCrcValid({
        telegram: invalid,
        crc: 0x25b5,
        newLineChars: '\r\n',
      });
      assert.equal(isValid, true);
    });

    it('Marks invalid CRCs as invalid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isCrcValid({
        telegram: invalid,
        crc: 0x25b5 + 1,
        newLineChars: '\r\n',
      });
      assert.equal(isValid, false);
    });
  });
});
