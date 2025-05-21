import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  isEqualObisCode,
  ObisCodeString,
  parseObisCodeFromBuffer,
  parseObisCodeFromString,
  parseObisCodeWithWildcards,
} from '../../src/protocols/obis-code.js';

describe('OBIS Code', () => {
  describe('parseObisCodeFromString', () => {
    it('Parses a valid OBIS code', () => {
      const str = '1-2:3.4.5';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.deepEqual(obisCode, {
        media: 1,
        channel: 2,
        physical: 3,
        type: 4,
        processing: 5,
        history: 0xff,
      });
      assert.equal(consumedChars, str.length);
    });

    it('Parses a valid OBIS code in a longer string', () => {
      const str = '1-2:3.4.5 some other text';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.deepEqual(obisCode, {
        media: 1,
        channel: 2,
        physical: 3,
        type: 4,
        processing: 5,
        history: 0xff,
      });
      assert.equal(consumedChars, 9);
    });

    it('Parses OBIS code with large numbers', () => {
      const str = '999-888:777.666.555';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.deepEqual(obisCode, {
        media: 999,
        channel: 888,
        physical: 777,
        type: 666,
        processing: 555,
        history: 0xff,
      });
      assert.equal(consumedChars, str.length);
    });

    it('Returns null for invalid OBIS code', () => {
      const str = 'invalid-obis-code';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for empty string', () => {
      const str = '';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for string with only delimiters', () => {
      const str = '-:..';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for too large numbers', () => {
      const str = '1000-1000:1000.1000.1000';
      const { obisCode, consumedChars } = parseObisCodeFromString(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });
  });

  describe('parseObisCodeFromBuffer', () => {
    it('Parses a valid OBIS code', () => {
      const buf = Buffer.from('010203040506', 'hex');
      const { obisCode } = parseObisCodeFromBuffer(buf);

      assert.deepEqual(obisCode, {
        media: 1,
        channel: 2,
        physical: 3,
        type: 4,
        processing: 5,
        history: 6,
      });
    });

    it('Returns null when buffer is longer than obis code', () => {
      const buf = Buffer.from('010203040506aabbccddeeff', 'hex');
      const { obisCode } = parseObisCodeFromBuffer(buf);
      assert.deepEqual(obisCode, null);
    });

    it('Returns null when buffer is shorter than obis code', () => {
      const buf = Buffer.from('0102', 'hex');
      const { obisCode } = parseObisCodeFromBuffer(buf);
      assert.deepEqual(obisCode, null);
    });
  });

  describe('parseObisCodeWithWildcards', () => {
    it('Parses a valid OBIS code', () => {
      const str = '1-*:3.4.5';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.deepEqual(obisCode, {
        media: 1,
        channel: '*',
        physical: 3,
        type: 4,
        processing: 5,
        history: '*',
      });
      assert.equal(consumedChars, str.length);
    });

    it('Parses a valid OBIS code in a longer string', () => {
      const str = '1-2:3.4.* some other text';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.deepEqual(obisCode, {
        media: 1,
        channel: 2,
        physical: 3,
        type: 4,
        processing: '*',
        history: '*',
      });
      assert.equal(consumedChars, 9);
    });

    it('Parses OBIS code with large numbers', () => {
      const str = '999-888:*.666.555';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.deepEqual(obisCode, {
        media: 999,
        channel: 888,
        physical: '*',
        type: 666,
        processing: 555,
        history: '*',
      });
      assert.equal(consumedChars, str.length);
    });

    it('Returns null for invalid OBIS code', () => {
      const str = 'invalid-obis-code';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for empty string', () => {
      const str = '';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for string with only delimiters', () => {
      const str = '-:..';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });

    it('Returns null for too large numbers', () => {
      const str = '1000-1000:1000.1000.1000';
      const { obisCode, consumedChars } = parseObisCodeWithWildcards(str);

      assert.equal(obisCode, null);
      assert.equal(consumedChars, 0);
    });
  });

  describe('isEqualObisCode', () => {
    const testIsEqualObisCode = (
      codeA: ObisCodeString,
      codeB: ObisCodeString,
      expected: boolean,
    ) => {
      it(`${codeA} ${expected ? '===' : '!=='} ${codeB}`, () => {
        const { obisCode: obisCodeA } = parseObisCodeWithWildcards(codeA);
        const { obisCode: obisCodeB } = parseObisCodeWithWildcards(codeB);

        assert.ok(obisCodeA !== null);
        assert.ok(obisCodeB !== null);

        const result = isEqualObisCode(obisCodeA, obisCodeB);
        assert.equal(result, expected, `Expected ${codeA} ${expected ? '===' : '!=='} ${codeB}`);
      });
    };

    testIsEqualObisCode('1-2:3.4.5', '1-2:3.4.5', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:3.4.*', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:3.*.*', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:*.4.5', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:*.4.*', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:*.4.*', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:*.4.*', true);
    testIsEqualObisCode('1-2:3.4.5', '1-2:3.*.*', true);
    testIsEqualObisCode('*-2:3.4.5', '1-2:3.*.5', true);

    testIsEqualObisCode('1-2:3.4.5', '5-4:3.2.1', false);
    testIsEqualObisCode('1-2:3.4.5', '1-2:*.4.6', false);
  });
});
