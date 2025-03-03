# Power Control and Flash Mode Selector

This project is a web-based application for controlling power and flash modes of a device. It supports dark mode and includes a dedicated section for displaying voltage and current readings. The project uses Parcel for bundling.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later recommended)
- [Parcel Bundler](https://parceljs.org/) (installed via `npm`)

## Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/picow_webapp.git
   cd picow_webapp

2. **Install dependencies:**
   ```bash
   npm install

## Development build
For development and debug
  ```bash
  npx parcel index.html
  ```

## Production Build

For a production (release) build, use:

  ```bash
  npx parcel build index.html
  ```

This command will bundle and optimize your assets, and output the final files to the dist folder.

## Deployment

After building for production, you can deploy the contents of the dist folder to your server. For example, using `scp`:

```bash
scp -r dist/* username@server:/path/to/deployment/directory
```

Replace `username`, `server`, and `/path/to/deployment/directory` with your server details and destination path.

## Project Usage

- **Connect/Disconnect:**  
  - Click the **Connect** button to establish a connection to the device.
  - Once connected, the device controls and voltage/current display section will be shown.
  - Click **Disconnect** to end the connection.

- **Power Control:**  
  - Toggle the 12V power control using the provided switch.

- **Flash Mode:**  
  - Use the Flash Mode toggle to switch between "Normal" and "Boot Flash" modes.

- **Voltage & Current Display:**  
  - The Voltage & Current section appears only after a successful connection.
  - When the device sends current data (e.g., `Current: -0.007 A`), the current value will be updated accordingly.

- **Dark Mode:**  
  - Toggle the dark mode switch at the top-right corner to switch between light and dark themes.

- **Advanced Controls:**  
  - Click on the **Advanced** section to view console messages and other debug information.

## Additional Information

For more details, refer to in-code comments within index.html and application.js.

The Device we interface in this Webapp is the Rpi Pico W. 
The microcontroller code can be found here at [PicoWWebUSB](https://github.com/elementosystems/PicoWWebUSB)


