import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DSMR } from '../../src/index.js';
import {
  encryptFrame,
  getAllDSMRTestTelegramTestCases,
  readDsmrTelegramFromFiles,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
} from './../test-utils.js';
import { isDsmrCrcValid, parseDsmr } from '../../src/protocols/dsmr.js';

describe('DSMR', async () => {
  const testCases = await getAllDSMRTestTelegramTestCases();

  for (const testCase of testCases) {
    it(`Parses ${testCase}`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const parsed = parseDsmr({ telegram: input });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (valid AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: TEST_AAD,
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (missing AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: undefined,
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });

    it(`Parses ${testCase} with decryption (invalid AAD)`, async () => {
      const { input, output: expectedOutput } = await readDsmrTelegramFromFiles(
        `./tests/telegrams/dsmr/${testCase}`,
      );

      const encrypted = encryptFrame({ frame: input, key: TEST_DECRYPTION_KEY, aad: TEST_AAD });

      const parsed = parseDsmr({
        telegram: encrypted,
        decryptionKey: TEST_DECRYPTION_KEY,
        additionalAuthenticatedData: Buffer.from('invalid-aad12345', 'ascii'),
      });

      assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), expectedOutput);
    });
  }

  it('Gets m-bus data', async () => {
    const { input } = await readDsmrTelegramFromFiles(
      './tests/telegrams/dsmr/dsmr-5.0-spec-example',
    );

    const parsed = parseDsmr({ telegram: input });

    const mbusData = DSMR.getMbusDevice('gas', parsed);

    assert.equal(mbusData?.deviceType, 0x03);
    assert.equal(mbusData?.unit, 'm3');
  });

  describe('M-Bus device selection', async () => {
    it('Returns undefined and an empty list when the device type is absent', async () => {
      const { input } = await readDsmrTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-5.0-spec-example',
      );

      const parsed = parseDsmr({ telegram: input });

      assert.equal(DSMR.getMbusDevice('water', parsed), undefined);
      assert.deepStrictEqual(DSMR.getMbusDevices('water', parsed), []);
      assert.equal(DSMR.getMbusDevice(0x42, parsed), undefined);
    });

    it('Prefers the gas channel that carries a reading over an empty registration', async () => {
      // Landis+Gyr E360 with a left-over (empty) gas registration on channel 1:
      // all-zero equipment ID and no 24.2.1 reading. The real gas meter is on channel 2.
      const { input } = await readDsmrTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-5.0-duplicate-gas-channels',
      );

      const parsed = parseDsmr({ telegram: input });

      const gas = DSMR.getMbusDevice('gas', parsed);

      assert.equal(gas?.mBusId, '2');
      assert.equal(gas?.deviceType, 0x03);
      assert.equal(gas?.value, 2913.277);
      assert.equal(gas?.unit, 'm3');
      assert.equal(gas?.equipmentId, '4730303030303030303030303030303031');

      assert.deepStrictEqual(
        DSMR.getMbusDevices('gas', parsed).map((device) => device.mBusId),
        ['1', '2'],
      );
    });

    it('Keeps the first channel when multiple devices are equally complete', async () => {
      // Channels 1 and 4 are both complete gas devices; the first one must still win.
      const { input } = await readDsmrTelegramFromFiles(
        './tests/telegrams/dsmr/dsmr-luxembourgh-spec-example',
      );

      const parsed = parseDsmr({ telegram: input });

      assert.equal(DSMR.getMbusDevice('gas', parsed)?.mBusId, '1');
      assert.equal(DSMR.getMbusDevice('water', parsed)?.mBusId, '2');
      assert.deepStrictEqual(
        DSMR.getMbusDevices('gas', parsed).map((device) => device.mBusId),
        ['1', '4'],
      );
    });

    it('Keeps the first channel when no device carries a reading', () => {
      const parsed = parseDsmr({
        telegram: [
          '/TST5TEST',
          '',
          '1-3:0.2.8(50)',
          '0-1:24.1.0(003)',
          '0-1:96.1.0(0000000000000000000000000000000000)',
          '0-2:24.1.0(003)',
          '0-2:96.1.0(0000000000000000000000000000000000)',
          '!',
          '',
        ].join('\r\n'),
      });

      assert.equal(DSMR.getMbusDevice('gas', parsed)?.mBusId, '1');
    });
  });

  it('Throws error on invalid telegram', () => {
    const input = "Hello, world! I'm not a valid telegram.";

    assert.throws(() => {
      parseDsmr({ telegram: input });
    });
  });

  describe('CRC Validation', () => {
    it('Marks valid CRCs as valid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isDsmrCrcValid({
        telegram: invalid,
        crc: 0x25b5,
      });
      assert.equal(isValid, true);
    });

    it('Marks invalid CRCs as invalid', () => {
      const invalid = '/TST512345\r\n\r\nHello, world!\r\n!25b5\r\n';
      const isValid = isDsmrCrcValid({
        telegram: invalid,
        crc: 0x25b5 + 1,
      });
      assert.equal(isValid, false);
    });
  });
});
