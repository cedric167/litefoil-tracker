// VESC simulé : permet d'essayer l'interface sans matériel (mode démo).

import { COMM, PacketDecoder, Reader, Writer, packPayload } from './protocol.js';
import { definitionForFw } from './config.js';

export class SimTransport {
  constructor() {
    this.name = 'VESC simulé';
    this.onData = () => {};
    this.onClose = () => {};
    this.decoder = new PacketDecoder((p) => this._handle(p));
    this.t0 = performance.now();
    this.ah = 0;
    this.wh = 0;
    this.tacho = 0;
    this.rpm = 0;
    this.current = 0;
    this.target = { mode: 'none', value: 0, until: 0 };
    this.fault = 0;
  }

  async open() {
    this.mc = await definitionForFw('mcconf', 6, 6);
    this.app = await definitionForFw('appconf', 6, 6);
    this.mcDefault = this.mc.snapshot();
    this.appDefault = this.app.snapshot();
    this.timer = setInterval(() => this._step(0.05), 50);
  }

  async close() {
    clearInterval(this.timer);
    this.onClose();
  }

  write(data) {
    // Petit délai pour imiter la latence BLE.
    setTimeout(() => this.decoder.push(data), 15);
    return Promise.resolve();
  }

  _reply(bytes) {
    const frame = packPayload(bytes);
    setTimeout(() => {
      for (let i = 0; i < frame.length; i += 20) this.onData(frame.subarray(i, i + 20));
    }, 20);
  }

  _print(text) {
    const w = new Writer().uint8(COMM.PRINT);
    for (const c of text) w.uint8(c.charCodeAt(0) & 0xFF);
    this._reply(w.toBytes());
  }

  _step(dt) {
    const now = performance.now();
    if (now > this.target.until) this.target.mode = 'none';
    const maxRpm = 40000;
    let wantRpm = 0;
    let wantCurrent = 0;
    switch (this.target.mode) {
      case 'duty': wantRpm = this.target.value * maxRpm; wantCurrent = Math.sign(wantRpm) * 2 + (wantRpm - this.rpm) * 0.004; break;
      case 'current': wantCurrent = this.target.value; wantRpm = this.rpm + this.target.value * 400 * dt * 10; break;
      case 'brake': wantCurrent = -this.target.value; wantRpm = this.rpm * 0.9; break;
      case 'rpm': wantRpm = this.target.value; wantCurrent = Math.sign(wantRpm) * 2 + (wantRpm - this.rpm) * 0.004; break;
      default: wantRpm = this.rpm * 0.97; wantCurrent = 0;
    }
    wantRpm = Math.max(-maxRpm, Math.min(maxRpm, wantRpm));
    this.rpm += (wantRpm - this.rpm) * Math.min(1, dt * 4);
    this.current += (wantCurrent - this.current) * Math.min(1, dt * 6);
    const vin = 48 - this.current * 0.05;
    const iin = this.current * Math.abs(this.rpm / maxRpm);
    this.ah += Math.max(0, iin) * dt / 3600;
    this.wh += Math.max(0, iin) * vin * dt / 3600;
    this.tacho += this.rpm / 60 * dt * 6;
    this.vin = vin;
    this.iin = iin;
  }

  _handle(payload) {
    let p = payload;
    if (p[0] === COMM.FORWARD_CAN) p = p.subarray(2);
    const id = p[0];
    const r = new Reader(p.subarray(1));
    const t = (performance.now() - this.t0) / 1000;
    const until = performance.now() + 1000;

    switch (id) {
      case COMM.FW_VERSION: {
        const w = new Writer().uint8(id).int8(6).int8(6).string('DEMO_75_300');
        w.bytes(Uint8Array.from({ length: 12 }, (_, i) => 0x10 + i));
        w.int8(0).int8(0).int8(0).int8(0).int8(1).int8(0).int8(0).uint8(3).string('Simulé').uint32(0);
        this._reply(w.toBytes());
        break;
      }
      case COMM.GET_VALUES: {
        const duty = Math.max(-1, Math.min(1, this.rpm / 40000));
        const w = new Writer().uint8(id)
          .double16(32 + 3 * Math.sin(t / 20) + Math.abs(this.current) * 0.1, 1e1)
          .double16(28 + Math.abs(this.current) * 0.15, 1e1)
          .double32(this.current, 1e2)
          .double32(this.iin, 1e2)
          .double32(0, 1e2)
          .double32(this.current, 1e2)
          .double16(duty, 1e3)
          .double32(this.rpm, 1)
          .double16(this.vin, 1e1)
          .double32(this.ah, 1e4)
          .double32(0, 1e4)
          .double32(this.wh, 1e4)
          .double32(0, 1e4)
          .int32(Math.round(this.tacho))
          .int32(Math.round(Math.abs(this.tacho)))
          .int8(this.fault)
          .double32(0, 1e6)
          .uint8(this.app.get('controller_id') ?? 0)
          .double16(31, 1e1).double16(32, 1e1).double16(31.5, 1e1)
          .double32(0, 1e3).double32(duty * this.vin, 1e3)
          .uint8(0);
        this._reply(w.toBytes());
        break;
      }
      case COMM.GET_MCCONF:
      case COMM.GET_APPCONF: {
        const cfg = id === COMM.GET_MCCONF ? this.mc : this.app;
        this._reply(new Writer().uint8(id).bytes(cfg.serialize()).toBytes());
        break;
      }
      case COMM.GET_MCCONF_DEFAULT:
      case COMM.GET_APPCONF_DEFAULT: {
        const cfg = id === COMM.GET_MCCONF_DEFAULT ? this.mc : this.app;
        const snap = cfg.snapshot();
        cfg.restore(id === COMM.GET_MCCONF_DEFAULT ? this.mcDefault : this.appDefault);
        const bytes = cfg.serialize();
        cfg.restore(snap);
        this._reply(new Writer().uint8(id).bytes(bytes).toBytes());
        break;
      }
      case COMM.SET_MCCONF:
      case COMM.SET_APPCONF: {
        const cfg = id === COMM.SET_MCCONF ? this.mc : this.app;
        if (cfg.deserialize(r)) this._reply(Uint8Array.of(id));
        break;
      }
      case COMM.SET_DUTY: this.target = { mode: 'duty', value: r.double32(1e5), until }; break;
      case COMM.SET_CURRENT: this.target = { mode: 'current', value: r.double32(1e3), until }; break;
      case COMM.SET_CURRENT_BRAKE: this.target = { mode: 'brake', value: r.double32(1e3), until }; break;
      case COMM.SET_RPM: this.target = { mode: 'rpm', value: r.int32(), until }; break;
      case COMM.SET_HANDBRAKE: this.target = { mode: 'brake', value: r.double32(1e3), until }; break;
      case COMM.ALIVE: this.target.until = until; break;
      case COMM.PING_CAN: this._reply(Uint8Array.of(id, 12, 34)); break;
      case COMM.TERMINAL_CMD: {
        const cmd = new TextDecoder().decode(r.rest()).trim();
        if (cmd === 'faults') this._print('No faults registered since startup');
        else if (cmd === 'help') this._print('Commandes simulées : help, faults, hw_status, uptime');
        else if (cmd === 'uptime') this._print('Uptime: ' + t.toFixed(1) + ' s');
        else if (cmd === 'hw_status') this._print('Firmware: 6.06\nHardware: DEMO_75_300\nUUID: 101112131415161718191A1B');
        else this._print('Invalid command: ' + cmd + '\ntype help to list all available commands');
        break;
      }
      case COMM.APP_DISABLE_OUTPUT: break;
      case COMM.DETECT_APPLY_ALL_FOC: {
        setTimeout(() => {
          this.mc.set('foc_motor_r', 0.0321, true);
          this.mc.set('foc_motor_l', 0.0000182, true);
          this.mc.set('foc_motor_flux_linkage', 0.00876, true);
          this.mc.set('l_current_max', 92.5, true);
          this.mc.set('l_current_min', -92.5, true);
          this._reply(new Writer().uint8(id).int16(1).toBytes());
        }, 4000);
        break;
      }
      case COMM.DETECT_MOTOR_R_L:
        setTimeout(() => this._reply(new Writer().uint8(id).double32(0.0321, 1e6).double32(18.2, 1e3).double32(1.1, 1e3).toBytes()), 1500);
        break;
      case COMM.GET_DECODED_PPM:
        this._reply(new Writer().uint8(id).double32(Math.sin(t) * 0.5, 1e6).double32(1.5, 1e6).toBytes());
        break;
      case COMM.GET_DECODED_ADC:
        this._reply(new Writer().uint8(id).double32(0.3, 1e6).double32(1.1, 1e6).double32(0, 1e6).double32(0, 1e6).toBytes());
        break;
      case COMM.GET_IMU_DATA: {
        const w = new Writer().uint8(id).uint16(0x01FF);
        [Math.sin(t) * 0.2, Math.cos(t / 2) * 0.1, t % 6.28, 0, 0, 1, 0, 0, 0].forEach((x) => w.double32Auto(x));
        this._reply(w.toBytes());
        break;
      }
      case COMM.REBOOT:
        this._print('Redémarrage simulé');
        break;
      case COMM.ERASE_NEW_APP:
        setTimeout(() => this._reply(Uint8Array.of(id, 1)), 500);
        break;
      case COMM.WRITE_NEW_APP_DATA:
        this._reply(new Writer().uint8(id).int8(1).uint32(r.uint32()).toBytes());
        break;
      case COMM.JUMP_TO_BOOTLOADER:
        this._print('Firmware simulé installé');
        break;
      default:
        break;
    }
  }
}
