/*
 * This is an example of how to parse Smart Meter data when connected to the WebSocket server of a
 * Homey Energy Dongle. Homey Energy Dongle will output the raw data from the connected Smart Meter
 * over its WebSocket server. This data can be parsed using the DSMR parser library.
 *
 * To get started, first make sure to enable the local API in the device settings of the Homey app.
 * There you can find the IP address of the Homey Energy Dongle as well. Then run this script as
 * follows:
 *
 * node examples/homey-energy-dongle-ws.js <ip> <decryption key (optional)>
 *
 * The script will automatically connect to the Homey Energy Dongle and start parsing data from your
 * Smart Meter!
 */

import WebSocket, { createWebSocketStream } from 'ws';
import { DSMRError, DSMR } from '@athombv/dsmr-parser';

const ENERGY_DONGLE_IP = process.argv[2];
const DECRYPTION_KEY = process.argv[3];

if (!ENERGY_DONGLE_IP) {
  console.log('Usage: node examples/homey-energy-dongle-ws.js <ip> <decryption key (optional)>');
  console.log('No IP address provided.');
  process.exit(1);
}

if (DECRYPTION_KEY) {
  console.log(`Decryption key: ${DECRYPTION_KEY}`);
}

/** @type {WebSocket | undefined} */
let ws;

process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (ws) {
    ws.terminate();
    ws.close();
    console.log('Connection closed');
  }

  console.log('Goodbye!');
  process.exit(0);
});

// You can obtain the address of Homey Energy Dongle by using mDNS discovery.
// Homey Energy Dongle can be found on the _energydongle._tcp service. This service contains
// the "p" (short for path) and "v" (short for version) TXT records.
// If the websocket server is not enabled, the "p" record will not be set.
// The "p" record contains the path to the websocket server.
const address = `ws://${ENERGY_DONGLE_IP}:80/ws`;

while (true) {
  console.log(`Connecting to ${address}`);

  // Use the ws package to handle the WebSocket connection to the Homey Energy Dongle.
  ws = new WebSocket(address);
  let interval;
  let receivedPong = false;

  // If the connection fails, log the error and terminate the connection.
  ws.on('error', (error) => {
    console.log('WS Error:', error);
    ws.terminate();
  });

  // If the connection is opened, log the event and start the ping interval.
  // The ping interval makes sure the connection is still alive by sending a ping every so often.
  ws.on('open', () => {
    console.log(`Connected to ${address}`);

    interval = setInterval(() => {
      if (!receivedPong) {
        console.log('No pong received, closing connection');
        ws.close();
        ws.terminate();
        return;
      }

      receivedPong = false;
      ws.ping();
    }, 10_000);

    ws.ping();
  });

  // Set a flag when a pong is received.
  ws.on('pong', () => {
    receivedPong = true;
  });

  // Stream all messages from the WebSocket connection.
  // The DSMR library will parse incoming data from the websocket,
  const stream = createWebSocketStream(ws);

  stream.on('data', (data) => {
    console.log('Stream data:', data.toString());
  });

  // If the stream encounters an error, log the error and terminate the connection.
  stream.on('error', (error) => {
    console.log('Stream error:', error);
    ws.terminate();
  });

  // Create a DSMR parser that listens to the stream.
  const parser = DSMR.createStreamParser({
    stream,
    decryptionKey: DECRYPTION_KEY,
    detectEncryption: true,
    callback: (error, result) => {
      if (error instanceof DSMRError) {
        console.error('Error parsing DSMR data:', error.message);
        console.error('Raw data:', error.rawTelegram?.toString('hex'));
      } else if (error) {
        console.error('Error:', error);
      } else {
        // Not very useful to log the raw telegram here as it is already logged by the data listener on the stream.
        delete result.raw;
        console.log('Parsed telegram:');
        console.dir(result, { depth: Infinity });
      }
    },
  });

  // Don't continue the loop until the connection is closed.
  await new Promise((resolve) => {
    ws.on('close', (code, reason) => {
      // Homey Energy Dongle only allows two clients to connect to the web socket at the same time.
      // If you get the error code 1008, with reason "Connection limit reached" there are already two clients connected.
      // If you get the error code 1008, with reason "Local API disabled" the local API is disabled and should be activated in the Homey app.
      console.log('WS disconnected:', code, reason.toString());
      clearInterval(interval);
      parser.destroy();
      resolve();
    });
  });

  // Some delay before reconnecting.
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
