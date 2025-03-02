(function () {
  'use strict';

  const CMD_GPIO_11 = 0x0B; //this is the byte for GPIO11
  const CMD_GPIO_12 = 0x0C; //this is the byte for GPIO12
  const CMD_GPIO_13 = 0x0D; //this is the byte for GPIO13
  const CMD_ON = 0x01;
  const CMD_OFF = 0x00;

  document.addEventListener('DOMContentLoaded', event => {
    const connectButton = document.getElementById('connect');
    const statusDisplay = document.getElementById('status');
    const gpioControls = document.getElementById('gpioControls');
    let serialPort;

    connectButton.addEventListener('click', async () => {
      try {
        serialPort = await serial.requestPort();
        await serialPort.connect();
        statusDisplay.textContent = 'Connected';
        gpioControls.style.display = 'block';
      } catch (error) {
        console.error("Error connecting:", error);
        statusDisplay.textContent = 'Connection Failed';
      }
    });

    function sendCommand(gpioPin, onOffState) {
      if (serialPort) {
        let commandBytes;
        let gpioCommandByte;

        switch (gpioPin) {
          case "gpio11": gpioCommandByte = CMD_GPIO_11; break;
          case "gpio12": gpioCommandByte = CMD_GPIO_12; break;
          case "gpio13": gpioCommandByte = CMD_GPIO_13; break;
          default: console.error("Unknown GPIO pin"); return;
        }

        commandBytes = [gpioCommandByte, onOffState];

        serialPort.send(new Uint8Array(commandBytes))
          .then(() => {
            console.log("Command sent:", commandBytes);
          })
          .catch(error => {
            console.error("Error sending command:", error);
            statusDisplay.textContent = 'Error sending command';
          });
      } else {
        console.error("Not connected to Pico W");
        statusDisplay.textContent = 'Not connected to Pico W';
      }
    }


    document.getElementById('gpio11').addEventListener('change', () => sendCommand('gpio11', document.getElementById('gpio11').checked ? CMD_ON : CMD_OFF));
    document.getElementById('gpio12').addEventListener('change', () => sendCommand('gpio12', document.getElementById('gpio12').checked ? CMD_ON : CMD_OFF));
    document.getElementById('gpio13').addEventListener('change', () => sendCommand('gpio13', document.getElementById('gpio13').checked ? CMD_ON : CMD_OFF));
  });
})();

