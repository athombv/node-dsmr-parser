/*
 * This is an example of how to parse Smart Meter data when connected to the USB port of a Homey Energy Dongle.
 * Homey Energy Dongle will output the raw data from the connected Smart Meter over its USB-C port. This data can be parsed
 * using the DSMR parser library.
 *
 * To get started, plug in the Homey Energy Dongle to a PC and to the Smart Meter. Then run this script as follows:
 *
 * node examples/homey-energy-dongle-usb.js
 *
 * The script will automatically detect the Homey Energy Dongle and start parsing data from from your Smart Meter!
 */
import { SerialPort } from 'serialport';
import { DlmsStreamParser, UnencryptedDSMRStreamParser, EncryptedDSMRStreamParser } from '@athombv/dsmr-parser';

const MODE = process.argv[2];
let serialPortPath = process.argv[3];
const DECRYPTION_KEY = process.argv[4];

if (!MODE || (MODE !== 'dsmr' && MODE !== 'dlms')) {
  console.log(
    'Usage: node examples/homey-energy-dongle-usb.js <mode> <port> <decryption key (optional)>',
  );
  console.log('No valid mode provided. Use "dsmr" or "dlms".');
  process.exit(1);
}

if (!serialPortPath) {
  const allPorts = await SerialPort.list();

  // This will find any product that uses an ESP32C6 chip, which is the chip used in the Homey Energy Dongle.
  const possiblePorts = allPorts.filter(
    (port) => port.vendorId === '303a' && port.productId === '1001',
  );

  if (possiblePorts.length === 0) {
    console.log(
      'Usage: node examples/homey-energy-dongle-usb.js <mode> <port> <decryption key (optional)>',
    );
    console.log('No Homey Energy Dongle found.');
    process.exit(1);
  } else if (possiblePorts.length > 1) {
    console.log('Multiple Homey Energy Dongles found. Please specify the port to use:');
    for (const port of possiblePorts) {
      console.log(`- ${port.path}`);
    }
    console.log(
      'Usage: node examples/homey-energy-dongle-usb.js <mode> <port> <decryption key (optional)>',
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

// Create a DSMR parser that listens to the UART stream.
const parser = (() => {
  if (MODE === 'dsmr' && !DECRYPTION_KEY) {
    return new UnencryptedDSMRStreamParser({
      stream,
      detectEncryption: true,
      callback: (error, result) => {
        if (error) {
          console.error('Error parsing DSMR data:', error);
        } else {
          console.log('Parsed telegram:');
          console.dir(result, { depth: Infinity });
        }
      },
    });
  }
  
  if (MODE === 'dsmr' && DECRYPTION_KEY) {
    return new EncryptedDSMRStreamParser({
      stream,
      decryptionKey: DECRYPTION_KEY,
      callback: (error, result) => {
        if (error) {
          console.error('Error parsing DSMR data:', error);
        } else {
          console.log('Parsed telegram:');
          console.dir(result, { depth: Infinity });
        }
      },
    })
  }

  return new DlmsStreamParser({
    stream,
    decryptionKey: DECRYPTION_KEY,
    callback: (error, result) => {
      if (error) {
        console.log('Error parsing DLMS data:', error.message);
      } else {
        console.log('Parsed DLMS telegram:');
        console.dir(result, { depth: Infinity });
      }
    },
  });
})();

// Make sure to close the port when the process exits
process.on('SIGINT', () => {
  console.log('Disconnecting...');

  parser.destroy();
  serialPort.close((err) => {
    if (err) {
      console.error('Error closing port:', err);
    } else {
      console.log('Disconnected!');
    }
    process.exit(0);
  });
});
