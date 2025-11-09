// Adapted from serial.js into ES module
class PortWrapper {
    constructor(device) {
      this.device_ = device
      this.interfaceNumber = 0
      this.endpointIn = 0
      this.endpointOut = 0
    }

    connect() {
      const self = this
      let readLoop = () => {
        self.device_.transferIn(self.endpointIn, 64).then(result => {
          if (result && result.data && self.onReceive) {
            self.onReceive(result.data)
          }
          readLoop()
        }, error => {
          if (self.onReceiveError) self.onReceiveError(error)
        })
      }

      return this.device_.open()
        .then(() => {
          if (this.device_.configuration === null) return this.device_.selectConfiguration(1)
        })
        .then(() => {
          const interfaces = this.device_.configuration.interfaces
          interfaces.forEach(element => {
            element.alternates.forEach(elementalt => {
              if (elementalt.interfaceClass == 0xFF) {
                this.interfaceNumber = element.interfaceNumber
                elementalt.endpoints.forEach(elementendpoint => {
                  if (elementendpoint.direction == 'out') this.endpointOut = elementendpoint.endpointNumber
                  if (elementendpoint.direction == 'in') this.endpointIn = elementendpoint.endpointNumber
                })
              }
            })
          })
        })
        .then(() => this.device_.claimInterface(this.interfaceNumber))
        .then(() => this.device_.selectAlternateInterface(this.interfaceNumber, 0))
        .then(() => this.device_.controlTransferOut({
          requestType: 'class',
          recipient: 'interface',
          request: 0x22,
          value: 0x01,
          index: this.interfaceNumber
        }))
        .then(() => {
          readLoop()
        })
    }

    disconnect() {
      return this.device_.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x22,
        value: 0x00,
        index: this.interfaceNumber
      }).then(() => this.device_.close())
    }

    send(data) {
      return this.device_.transferOut(this.endpointOut, data)
    }
  }

  const serialService = {
    port: null,
    telemetryCb: null,
    connectionCbs: [],
    textDecoder: new TextDecoder(),

    requestPort() {
      const filters = [{ vendorId: 0xcafe }]
      return navigator.usb.requestDevice({ filters }).then(device => {
        this.port = new PortWrapper(device)
        return this.port
      })
    },

    connect() {
      if (!this.port) return Promise.reject(new Error('No port selected'))
      return this.port.connect().then(() => {
        // notify connection listeners
        this.connectionCbs.forEach(cb => { try { cb(true) } catch (e) {} })
        // wire up receive handling
        this.port.onReceive = (dataView) => {
          try {
            const text = this.textDecoder.decode(dataView.buffer || dataView)
            // parse telemetry lines like "Current: -0.007 A" or "Voltage: 5.02 V"
            const now = new Date()
            const items = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
            items.forEach(line => {
              let parsed = {}
              if (line.includes('Current:')) {
                const m = line.match(/Current:\s*(-?\d+\.?\d*)\s*A/)
                if (m) parsed.current = parseFloat(m[1])
              }
              if (line.includes('Voltage:')) {
                const m = line.match(/Voltage:\s*(\d+\.?\d*)\s*V/)
                if (m) parsed.voltage = parseFloat(m[1])
              }
              if (Object.keys(parsed).length) {
                parsed.time = now
                if (this.telemetryCb) this.telemetryCb(parsed)
              }
            })
          } catch (err) {
            console.error('Decode error', err)
          }
        }
        this.port.onReceiveError = (err) => console.error('Receive error', err)
      })
    },

    disconnect() {
      if (!this.port) return Promise.resolve()
      return this.port.disconnect().then(() => { this.port = null })
    },

    sendCommand(name, onOffState) {
      if (!this.port) {
        console.warn('Not connected')
        return
      }
      const CMD = { gpio11: 0x0B, gpio12: 0x0C, gpio13: 0x0D, gpio14: 0x0E }
      const cmd = CMD[name]
      if (!cmd) return console.error('Unknown gpio', name)
      const bytes = new Uint8Array([cmd, onOffState])
      this.port.send(bytes).catch(err => console.error('Send error', err))
    },

    setOnTelemetry(cb) { this.telemetryCb = cb },
    addOnConnectionChange(cb) { if (typeof cb === 'function') this.connectionCbs.push(cb) },
    isConnected() { return !!this.port }
  }

export default serialService;
