import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateCrc16, isCrcValid } from '../src/util/crc';

describe('CRC', () => {
  describe('CRC16', () => {
    // Note: these cases have been verified using https://crccalc.com/
    const CRC_TESTS = [
      {
        input: 'Hello, world!',
        output: 0x9A4A
      },
      {
        input: '',
        output: 0x0000
      },
      {
        input: '123456789',
        output: 0xBB3D
      },
      {
        input: 'The quick brown fox jumps over the lazy dog',
        output: 0xFCDF
      },
      {
        input: 'Lorem ipsum dolor sit amet',
        output: 0xC14F
      },
    ];
  
    for (const test of CRC_TESTS) {
      it (`Calculates the CRC of "${test.input}"`, () => {
        const buf = Buffer.from(test.input);
        const crc = calculateCrc16(buf);
        assert.equal(crc, test.output);
      });
    }
  });

  describe('Telegrams', () => {
    it('Marks valid CRCs as valid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isCrcValid(invalid, 0x25b5);
      assert.equal(isValid, true);
    });

    it('Marks invalid CRCs as invalid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isCrcValid(invalid, 0x25b5 + 1);
      assert.equal(isValid, false);
    });
  });
});