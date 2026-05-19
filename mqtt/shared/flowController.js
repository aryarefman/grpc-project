// ============================================================================
// NovaPulse MQTT - Flow Controller (Fitur 10: Flow Control / Backpressure)
// ============================================================================
// Mengimplementasikan MQTT 5.0 receiveMaximum behaviour di atas protocol v4.
// Mekanisme:
//   1. Publisher side: batasi jumlah QoS 1/2 pesan inflight bersamaan.
//      Jika inflight >= receiveMaximum → queue pesan, jangan publish dulu.
//   2. Saat broker kirim PUBACK/PUBCOMP (ACK) → inflight berkurang,
//      item antrian diproses (mirip sliding-window protocol).
//   3. Log inflight state secara periodik agar terlihat saat demo.
// ============================================================================

const chalk = require('chalk');

class FlowController {
  /**
   * @param {import('mqtt').MqttClient} client
   * @param {string} clientId
   * @param {number} receiveMaximum  max QoS 1/2 in-flight (default: 10)
   */
  constructor(client, clientId, receiveMaximum = 10) {
    this.client         = client;
    this.clientId       = clientId;
    this.receiveMaximum = receiveMaximum;  // MQTT 5.0 receiveMaximum
    this.inflight       = 0;              // jumlah pesan QoS>0 belum di-ACK
    this.queue          = [];             // antrian saat window penuh
    this.totalQueued    = 0;
    this.totalDropped   = 0;

    // ── Track outgoing QoS 1/2 (meng-consume window slot) ──────────────────
    client.on('packetsend', (packet) => {
      if (packet.cmd === 'publish' && packet.qos > 0) {
        this.inflight++;
        if (this.inflight >= this.receiveMaximum) {
          console.log(chalk.yellow(
            `  🔀 [FLOW CTRL] Window FULL: inflight=${this.inflight}/${this.receiveMaximum} — backpressure active`
          ));
        }
      }
    });

    // ── Track ACKs (membebaskan window slot) ───────────────────────────────
    client.on('packetreceive', (packet) => {
      if (packet.cmd === 'puback' || packet.cmd === 'pubcomp') {
        this.inflight = Math.max(0, this.inflight - 1);
        this._drainQueue();
      }
    });
  }

  /**
   * Publish dengan flow control. Jika window penuh, masuk antrian.
   * @param {string} topic
   * @param {string|Buffer} payload
   * @param {object} options  (qos, retain, properties, dll)
   * @param {Function} [callback]
   */
  publish(topic, payload, options = {}, callback) {
    const qos = options.qos || 0;

    // QoS 0: tidak di-track (fire-and-forget, tidak butuh ACK)
    if (qos === 0) {
      return this.client.publish(topic, payload, options, callback);
    }

    // QoS 1/2: cek apakah window masih ada ruang
    if (this.inflight < this.receiveMaximum) {
      return this.client.publish(topic, payload, options, callback);
    }

    // Window penuh → masuk antrian (backpressure)
    this.queue.push({ topic, payload, options, callback });
    this.totalQueued++;
    console.log(chalk.gray(
      `  🔀 [FLOW CTRL] Queued (${this.queue.length} pending, inflight=${this.inflight}/${this.receiveMaximum})`
    ));
  }

  /** Drain antrian saat ada slot kosong */
  _drainQueue() {
    while (this.queue.length > 0 && this.inflight < this.receiveMaximum) {
      const item = this.queue.shift();
      console.log(chalk.blue(
        `  🔀 [FLOW CTRL] Draining queue → ${item.topic} (remaining: ${this.queue.length})`
      ));
      this.client.publish(item.topic, item.payload, item.options, item.callback);
    }
  }

  /** Status summary untuk logging */
  getStatus() {
    return {
      receiveMaximum: this.receiveMaximum,
      inflight: this.inflight,
      queued: this.queue.length,
      totalQueued: this.totalQueued,
      windowUtilization: `${Math.round((this.inflight / this.receiveMaximum) * 100)}%`,
    };
  }

  /** Log status berkala */
  startPeriodicLog(intervalMs = 30000) {
    setInterval(() => {
      if (this.inflight > 0 || this.queue.length > 0) {
        const s = this.getStatus();
        console.log(chalk.blue(
          `  🔀 [FLOW CTRL] Status: inflight=${s.inflight}/${s.receiveMaximum}` +
          ` | queued=${s.queued} | window=${s.windowUtilization}`
        ));
      }
    }, intervalMs);
  }
}

module.exports = FlowController;
