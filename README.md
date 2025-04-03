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

## Docker Image
The repository includes a Dockerfile that hosts the contents of the dist folder in an NGINX server. The Dockerfile also uses BuildKit's TARGETARCH argument to execute an additional command only when building for AMD64.

- **Building for AMD64**
  To build the Docker image for an AMD64 system run:
   ```
   docker build -t picow_webapp .
   ```

- **Building for ARM (e.g. Raspberry Pi)**
  Make sure you have Docker Buildx set up. Then build targeting ARM architecture (for example, ARMv7):
   ```
   docker buildx create --use --name mybuilder
   docker buildx build --platform linux/arm/v7 --load -t picow_webapp
   ```
- **For a 64‑bit Raspberry Pi running ARM64, use:**
  ```
  docker buildx build --platform linux/arm64 --load -t picow_webapp .
  ```
- **Running the Docker Container:**
  Once the image is built, run it with:
  ```
  docker run -d -p 8080:80 picow_webapp
  ```
  Then open http://localhost:8080 (or the appropriate host/port) to view the app.
## Additional Information

For more details, refer to in-code comments within index.html and application.js.

The Device we interface in this Webapp is the Rpi Pico W. 
The microcontroller code can be found here at [PicoWWebUSB](https://github.com/elementosystems/PicoWWebUSB)

