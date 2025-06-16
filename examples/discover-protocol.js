import { SerialPort } from 'serialport';
import { SmartMeterDetectTypeStream } from '@athombv/dsmr-parser';

const SERIAL_PORT_PATH = process.argv[2];

if (!SERIAL_PORT_PATH) {
  console.log('Usage: node examples/discover-protocol.js <serial-port-path>');
  console.log('No serial port path provided.');
  process.exit(1);
}

console.log(`Discovering protocol on serial port: ${SERIAL_PORT_PATH}`);

const serialPort = new SerialPort(
  {
    path: SERIAL_PORT_PATH,
    baudRate: 115200,
  },
  (err) => {
    if (err) {
      console.error('Error opening port:', err);
      process.exit(1);
    } else {
      console.log('Waiting for data on the serial port...');
    }
  },
);

const discoveryParser = new SmartMeterDetectTypeStream({
  stream: serialPort,
  callback: (result) => {
    console.log(`Detected protocol type: ${result.mode}`);
    console.log(`Is ${result.encrypted ? '' : 'not '}using encryption`);

    discoveryParser.destroy();

    serialPort.close((err) => {
      if (err) {
        console.error('Error closing port:', err);
      }

      process.exit(0);
    });
  },
});

setTimeout(() => {
  console.log('No protocol detected within 30 seconds. Exiting...');
  discoveryParser.destroy();
  serialPort.close((err) => {
    if (err) {
      console.error('Error closing port:', err);
    }

    process.exit(0);
  });
}, 30000);
