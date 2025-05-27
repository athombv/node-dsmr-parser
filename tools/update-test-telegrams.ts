/* eslint-disable no-console */
/**
 * This scripts reads all .txt files in the tests/telegrams folder, parses them and writes the
 * result to a .json file. Only run this script if you want to update the expected output of the
 * DSMRParser.
 */
import fs from 'fs/promises';
import {
  encryptFrame,
  getAllDLMSTestTelegramTestCases,
  getAllDSMRTestTelegramTestCases,
  readHexFile,
  TEST_AAD,
  TEST_DECRYPTION_KEY,
  wrapHdlcFrame,
  writeHexFile,
} from '../tests/test-utils.js';
import { DlmsStreamParser } from '../src/stream/stream-dlms.js';
import { PassThrough } from 'stream';
import { parseDsmr } from '../src/protocols/dsmr.js';
import { decodeHdlcHeader, decodeLlcHeader, HDLC_FOOTER_LENGTH } from '../src/protocols/hdlc.js';

// Parse all DSMR telegrams
{
  const testCases = await getAllDSMRTestTelegramTestCases();

  for (const file of testCases) {
    let input = await fs.readFile(`./tests/telegrams/dsmr/${file}.txt`, 'utf-8');
    input = input.replace(/\r?\n/g, '\r\n');
    console.log(`Parsing ${file}.txt`);
    const parsed = parseDsmr({ telegram: input });
    const json = JSON.stringify(parsed, null, 2);
    await fs.writeFile(`./tests/telegrams/dsmr/${file}.json`, json);
  }
}

// Encrypted DSMR frames
{
  const fileToEncrypt = 'dsmr-luxembourgh-spec-example';
  console.log(`Using ${fileToEncrypt} as test case for encrypted DSMR telegrams`);

  let input = await fs.readFile(`./tests/telegrams/dsmr/${fileToEncrypt}.txt`, 'utf-8');
  input = input.replace(/\r?\n/g, '\r\n');

  const encryptedAad = encryptFrame({
    frame: Buffer.from(input, 'utf-8'),
    key: TEST_DECRYPTION_KEY,
    aad: TEST_AAD,
  });

  await writeHexFile(
    `./tests/telegrams/dsmr/encrypted/${fileToEncrypt}-with-aad.txt`,
    encryptedAad,
  );

  const encryptedWithoutAad = encryptFrame({
    frame: Buffer.from(input, 'utf-8'),
    key: TEST_DECRYPTION_KEY,
  });

  await writeHexFile(
    `./tests/telegrams/dsmr/encrypted/${fileToEncrypt}-without-aad.txt`,
    encryptedWithoutAad,
  );
}

// Parse all DLMS telegrams
{
  const dlmsTestCases = await getAllDLMSTestTelegramTestCases();

  for (const file of dlmsTestCases) {
    console.log(`Parsing ${file}.txt`);
    const input = await readHexFile(`./tests/telegrams/dlms/${file}.txt`);

    const passthrough = new PassThrough();

    const results: object[] = [];

    const parser = new DlmsStreamParser({
      stream: passthrough,
      callback: (error, result) => {
        if (error) {
          if (error instanceof Error) {
            results.push({
              error: {
                message: error.message,
                name: error.name,
                stack: error.stack,
              },
            });
          } else {
            results.push({
              error,
            });
          }
        } else if (result) {
          results.push(result);
        }
      },
    });

    await new Promise((resolve) => passthrough.write(input, resolve));

    if (results.length !== 1) {
      console.warn('Warning: more than one result found!');
    }

    const json = JSON.stringify(results[0], null, 2);
    await fs.writeFile(`./tests/telegrams/dlms/${file}.json`, json);
    parser.destroy();
  }
}

// Encrypted DLMS frames
{
  const dlmsFileToEncrypt = 'aidon-example-2';
  console.log(`Using ${dlmsFileToEncrypt} as test case for encrypted DLMS telegrams`);

  const input = await readHexFile(`./tests/telegrams/dlms/${dlmsFileToEncrypt}.txt`);

  const hdlcHeader = decodeHdlcHeader(input);

  const frame = input.subarray(0, hdlcHeader.frameLength + 2);
  const frameContent = frame.subarray(hdlcHeader.consumedBytes);

  const llc = decodeLlcHeader(frameContent);
  const content = frame.subarray(
    hdlcHeader.consumedBytes + llc.consumedBytes,
    frame.length - HDLC_FOOTER_LENGTH,
  );

  const encryptedAad = encryptFrame({
    frame: content,
    // frame: Buffer.from('Hello, world! 12345678901234567890123456789'),
    key: TEST_DECRYPTION_KEY,
    aad: TEST_AAD,
  });

  const encryptedWithoutAad = encryptFrame({
    frame: content,
    key: TEST_DECRYPTION_KEY,
  });

  const llcBuffer = Buffer.from([
    llc.destination,
    llc.source,
    llc.quality
  ]);

  const frameWithAad = wrapHdlcFrame(Buffer.concat([llcBuffer, encryptedAad]));
  const frameWithoutAad = wrapHdlcFrame(Buffer.concat([llcBuffer, encryptedWithoutAad]));

  await writeHexFile(
    `./tests/telegrams/dlms/encrypted/${dlmsFileToEncrypt}-with-aad.txt`,
    frameWithAad,
  );
  await writeHexFile(
    `./tests/telegrams/dlms/encrypted/${dlmsFileToEncrypt}-without-aad.txt`,
    frameWithoutAad,
  );
}
