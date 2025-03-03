(function () {
  'use strict';

  const CMD_GPIO_11 = 0x0B; //this is the byte for GPIO11
  const CMD_GPIO_12 = 0x0C; //this is the byte for GPIO12
  const CMD_GPIO_13 = 0x0D; //this is the byte for GPIO13
  const CMD_ON = 0x01;
  const CMD_OFF = 0x00;

  document.addEventListener('DOMContentLoaded', event => {
    const connectDisconnectButton = document.getElementById('connectDisconnect');
    const statusDisplay = document.getElementById('status');
    const gpioControls = document.getElementById('gpioControls');
    const voltageCurrent = document.getElementById('voltageCurrent'); // Voltage/Current section
    let serialPort;
    let isConnected = false;

    connectDisconnectButton.addEventListener('click', async () => {
      if (!isConnected) {
        try {
          serialPort = await serial.requestPort();
          await serialPort.connect();

          // Set up a callback to process incoming data
          serialPort.onReceive = function(data) {
            // Decode the received data into text.
            const decoder = new TextDecoder();
            const text = decoder.decode(data.buffer);
            console.log("Received:", text);

            // Look for a current value in the received text, e.g., "Current: -0.007 A"
            if (text.includes("Current:")) {
              const match = text.match(/Current:\s*(-?\d+\.\d+)\s*A/);
              if (match) {
                const currentVal = match[1];
                document.getElementById("current").textContent = "Current: " + currentVal + " A";
              }
            }
          };

          statusDisplay.textContent = 'Connected';
          gpioControls.style.display = 'block';
          voltageCurrent.style.display = 'block'; // Show voltage/current section
          connectDisconnectButton.textContent = 'Disconnect';
          isConnected = true;
        } catch (error) {
          console.error("Error connecting:", error);
          statusDisplay.textContent = 'Connection Failed';
        }
      } else {
        try {
          await serialPort.disconnect();
          statusDisplay.textContent = 'Disconnected';
          gpioControls.style.display = 'none';
          voltageCurrent.style.display = 'none'; // Hide voltage/current section on disconnect
          connectDisconnectButton.textContent = 'Connect';
          isConnected = false;
          serialPort = null; //important to reset serialPort
        } catch (error) {
          console.error("Error disconnecting:", error);
          statusDisplay.textContent = 'Disconnection Failed';
        }
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

    const flashModeToggle = document.getElementById('flashModeToggle');

    flashModeToggle.addEventListener('change', () => {
      if (flashModeToggle.checked) {
        // Toggle is on - enable boot loader mode
        sendCommand('gpio12', CMD_ON);
        sendCommand('gpio13', CMD_ON);
      } else {
        // Toggle is off - set normal flash mode
        sendCommand('gpio12', CMD_OFF);
        sendCommand('gpio13', CMD_OFF);
      }
    });

    document.getElementById('gpio11').addEventListener('change', () => 
      sendCommand('gpio11', document.getElementById('gpio11').checked ? CMD_ON : CMD_OFF));

    // Updated slider handling: Toggle checkbox only if not disabled
    const sliders = document.querySelectorAll('.gpio-slider .slider');
    sliders.forEach(slider => {
      slider.addEventListener('click', () => {
        const checkbox = slider.previousElementSibling;
        if (checkbox && !checkbox.disabled) { // Only toggle if not disabled
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  });
})();

