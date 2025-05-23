(function () {
  'use strict';

  const CMD_GPIO_11 = 0x0B; // Byte for GPIO11
  const CMD_GPIO_12 = 0x0C; // Byte for GPIO12
  const CMD_GPIO_13 = 0x0D; // Byte for GPIO13
  const CMD_GPIO_14 = 0x0E; // Byte for GPIO13
  const CMD_ON = 0x01;
  const CMD_OFF = 0x00;

  document.addEventListener('DOMContentLoaded', event => {
    const connectDisconnectButton = document.getElementById('connectDisconnect');
    const statusDisplay = document.getElementById('status');
    const gpioControls = document.getElementById('gpioControls');
    // Instead of a combined voltageCurrent section, use separate sections:
    const currentSection = document.getElementById('currentSection');
    const voltageSection = document.getElementById('voltageSection');
    const currentEl = document.getElementById('currentDisplay'); // Element that displays current text
    const voltageEl = document.getElementById('voltageDisplay'); // Element that displays voltage text
    let serialPort;
    let isConnected = false;

    // Initialize Chart.js chart for Current
    const currentCanvas = document.getElementById('currentChart');
    const currentCtx = currentCanvas.getContext('2d');
    const currentChart = new Chart(currentCtx, {
      type: 'line',
      data: {
        labels: [], // Time stamps
        datasets: [{
          label: 'Current (A)',
          data: [],
          borderColor: 'red',
          backgroundColor: 'rgba(255,0,0,0.2)',
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: { unit: 'second' },
            title: { display: true, text: 'Time' }
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'Current (A)' }
          }
        }
      }
    });

    // Initialize Chart.js chart for Voltage
    const voltageCanvas = document.getElementById('voltageChart');
    const voltageCtx = voltageCanvas.getContext('2d');
    const voltageChart = new Chart(voltageCtx, {
      type: 'line',
      data: {
        labels: [], // Time stamps
        datasets: [{
          label: 'Voltage (V)',
          data: [],
          borderColor: 'blue',
          backgroundColor: 'rgba(0,0,255,0.2)',
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: { unit: 'second' },
            title: { display: true, text: 'Time' }
          },
          y: {
            beginAtZero: false,
            title: { display: true, text: 'Voltage (V)' }
          }
        }
      }
    });

    connectDisconnectButton.addEventListener('click', async () => {
      if (!isConnected) {
        try {
          serialPort = await serial.requestPort();
          await serialPort.connect();

          // Set up a callback to process incoming data
          serialPort.onReceive = function(data) {
            const decoder = new TextDecoder();
            const text = decoder.decode(data.buffer);
            console.log("Received:", text);

            const now = new Date();

            // Update current value and chart if data contains "Current:"
            if (text.includes("Current:")) {
              const match = text.match(/Current:\s*(-?\d+\.\d+)\s*A/);
              if (match) {
                const currentVal = parseFloat(match[1]);
                currentEl.textContent = "Current: " + currentVal + " A";
                currentChart.data.labels.push(now);
                currentChart.data.datasets[0].data.push(currentVal);
                while (currentChart.data.labels.length > 60) {
                  currentChart.data.labels.shift();
                  currentChart.data.datasets[0].data.shift();
                }
                currentChart.update();
              }
            }

            // Update voltage value and chart if data contains "Voltage:"
            if (text.includes("Voltage:")) {
              const matchVoltage = text.match(/Voltage:\s*(\d+\.\d+)\s*V/);
              if (matchVoltage) {
                const voltageVal = matchVoltage[1];
                voltageEl.textContent = "Voltage: " + voltageVal + " V";
                voltageChart.data.labels.push(now);
                voltageChart.data.datasets[0].data.push(parseFloat(voltageVal));
                while (voltageChart.data.labels.length > 0 && now - voltageChart.data.labels[0] > 60000) {
                  voltageChart.data.labels.shift();
                  voltageChart.data.datasets[0].data.shift();
                }
                voltageChart.update();
              }
            }
          };

          statusDisplay.textContent = 'Connected';
          gpioControls.style.display = 'block';
          currentSection.style.display = 'block';
          voltageSection.style.display = 'block';
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
          currentSection.style.display = 'none';
          voltageSection.style.display = 'none';
          connectDisconnectButton.textContent = 'Connect';
          isConnected = false;
          serialPort = null;
        } catch (error) {
          console.error("Error disconnecting:", error);
          statusDisplay.textContent = 'Disconnection Failed';
        }
      }
    });

    function sendCommand(gpioPin, onOffState) {
      if (serialPort) {
        let gpioCommandByte;
        switch (gpioPin) {
          case "gpio11": gpioCommandByte = CMD_GPIO_11; break;
          case "gpio12": gpioCommandByte = CMD_GPIO_12; break;
          case "gpio13": gpioCommandByte = CMD_GPIO_13; break;
          case "gpio14": gpioCommandByte = CMD_GPIO_14; break;
          default: console.error("Unknown GPIO pin"); return;
        }
        const commandBytes = [gpioCommandByte, onOffState];
        serialPort.send(new Uint8Array(commandBytes))
          .then(() => { console.log("Command sent:", commandBytes); })
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
        sendCommand('gpio13', CMD_ON);
        sendCommand('gpio14', CMD_ON);
      } else {
        sendCommand('gpio13', CMD_OFF);
        sendCommand('gpio14', CMD_OFF);
      }
    });

    // document.getElementById('gpio11').addEventListener('change', () => 
    //   sendCommand('gpio11', document.getElementById('gpio11').checked ? CMD_ON : CMD_OFF));
    document.getElementById('debuggerControlToggle').addEventListener('change', () => 
      sendCommand('gpio12', document.getElementById('debuggerControlToggle').checked ? CMD_ON : CMD_OFF));

    // Updated slider handling for checkboxes (if your selectors match your HTML)
    const sliders = document.querySelectorAll('.gpio-slider .slider');
    sliders.forEach(slider => {
      slider.addEventListener('click', () => {
        const checkbox = slider.previousElementSibling;
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });

    let ecuTimer = null;
    const ecuPowerToggle = document.getElementById('gpio11');
    const delayOption = document.getElementById('ecuDelayOption');

    ecuPowerToggle.addEventListener('change', () => {
      // If turning ECU power on
      if (ecuPowerToggle.checked) {
        if (delayOption.checked) {
          console.log("ECU Power will turn on after a 10-second delay.");
          ecuTimer = setTimeout(() => {
            console.log("ECU Power turned on after 10s delay.");
            sendCommand('gpio11', CMD_ON);
            ecuTimer = null;
          }, 10000);
        } else {
          // If delay is not selected, execute immediately and cancel any pending timer.
          if (ecuTimer !== null) {
            clearTimeout(ecuTimer);
            ecuTimer = null;
          }
          console.log("ECU Power turned on immediately.");
          sendCommand('gpio11', CMD_ON);
        }
      } else {
        // If turning ECU power off, cancel any pending delay and send off command.
        if (ecuTimer !== null) {
          clearTimeout(ecuTimer);
          ecuTimer = null;
        }
        console.log("ECU Power turned off.");
        sendCommand('gpio11', CMD_OFF);
      }
    });
    delayOption.addEventListener('change', () => {
      if (!delayOption.checked && ecuTimer !== null) {
        console.log("Delay canceled; sending ECU Power ON immediately.");
        clearTimeout(ecuTimer);
        ecuTimer = null;
        // Only send command if the toggle is still on.
        if (ecuPowerToggle.checked) {
          sendCommand('gpio11', CMD_ON);
        }
      }
    });
  });
})();

