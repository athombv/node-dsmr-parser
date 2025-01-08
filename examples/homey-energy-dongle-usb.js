/*
 * This is an example of how to parse Smart Meter data when connected to the USB port of a Homey Energy Dongle.
 * Homey Energy Dongle will output the raw data from the meter, encapsulated in a JSON object. After each JSON object,
 * a newline is printed, which can be used to detect the end of the JSON object.
 *
 *  > **Note**: In theory a JSON object could contain a newline, but Homey Energy Dongle will always output
 *  > flattened JSON objects, so this is not a concern.
 */
import stream from 'node:stream';

import { SerialPort, ReadlineParser } from 'serialport';
import { DSMRError, DSMR } from '../src/index.js';

let serialPortPath = process.argv[2];
const DECRYPTION_KEY = process.argv[3];

if (!serialPortPath) {
  const allPorts = await SerialPort.list();

  // This will find any product that uses an ESP32C6 chip, which is the chip used in the Homey Energy Dongle.
  const possiblePorts = allPorts.filter(
    (port) => port.vendorId === '303a' && port.productId === '1001',
  );

  if (possiblePorts.length === 0) {
    console.log(
      'Usage: npx tsx examples/homey-energy-dongle-usb.js <port> <decryption key (optional)>',
    );
    console.log('No Homey Energy Dongle found.');
    process.exit(1);
  } else if (possiblePorts.length > 1) {
    console.log('Multiple Homey Energy Dongles found. Please specify the port to use:');
    for (const port of possiblePorts) {
      console.log(`- ${port.path}`);
    }
    console.log(
      'Usage: npx tsx examples/homey-energy-dongle-usb.js <port> <decryption key (optional)>',
    );
    process.exit(1);
  } else {
    serialPortPath = possiblePorts[0].path;
  }
}

console.log(`Connecting to ${serialPortPath}`);

if (DECRYPTION_KEY) {
  console.log(`Decryption key: ${DECRYPTION_KEY}`);
}

// Use node-serialport to handle the serial connection to the Homey Energy Dongle.
// The baud rate will be 115200, with 8 data bits, 1 stop bit, and no parity.
const serialPort = new SerialPort(
  {
    path: serialPortPath,
    baudRate: 115200,
  },
  (err) => {
    if (err) {
      console.error('Error opening port:', err);
      process.exit(1);
    }

    console.log('Connected!');
  },
);

// Data available on the serial port is raw data from the USB serial interface. This data will be transmitted in several chunks,
// The input is piped through several transform streams to parse the JSON objects and extract the raw meter data.
stream
  .pipeline(
    serialPort,
    // 1. Each json object will be separated by a newline.
    //    In theory a JSON object could contain a newline, but Homey Energy Dongle will always output
    //    flattened JSON objects, so this is not a concern.
    new ReadlineParser({
      delimiter: '\n',
      encoding: 'binary',
    }),
    // 2. Parse the lines as JSON objects and filter out the DSMR telegrams
    //    The DSMR telegram JSON object will look like this:
    //    { "event": "dsmr_telegram", "data": "..." }
    new stream.Transform({
      transform(chunk, _encoding, callback) {
        try {
          const json = JSON.parse(chunk);

          if (json.event === 'dsmr_telegram') {
            this.push(Buffer.from(json.data, 'binary'));
          } else {
            // More events could be emitted, but they are not relevant for this example.
            console.log('Unknown event:', json);
          }
        } catch (e) {
          console.error('Error parsing JSON:', e);
        }
        callback();
      },
    }),
    // 3. Parse the raw meter data using the DSMR parser
    DSMR.createStreamTransformer({
      decryptionKey: DECRYPTION_KEY,
      detectEncryption: true,
    }),
    // 4. Error handler for when an error occurs in the stream. Note that the stream will end when an error occurs here.
    (err) => {
      if (err) {
        console.error('Error in pipeline:', err);
      }
    },
  )
  // 5. Log the data. Because `DSMR.createStreamTransformer` uses object mode it can emit
  //    objects in the stream. The error will be set when parsing failed, and the result will be set when parsing succeeded.
  .on('data', ({ error, result }) => {
    if (error instanceof DSMRError) {
      console.error('Error parsing DSMR data:', error.message);
      console.error('Raw data:', error.rawTelegram?.toString('hex'));
    } else if (error) {
      console.error('Error:', error);
    } else {
      console.log('Raw telegram:');
      console.log(result.raw);
      console.log('Parsed telegram:');
      delete result.raw;
      console.log(result);
    }
  });

// Make sure to close the port when the process exits
process.on('SIGINT', () => {
  console.log('Disconnecting...');

  serialPort.close((err) => {
    if (err) {
      console.error('Error closing port:', err);
    } else {
      console.log('Disconnected!');
    }
    process.exit(0);
  });
});
