// ============================================================================
// NovaPulse MQTT - Feature Configuration
// QoS, Expiry, Flow Control, Retain settings
// ============================================================================

const QOS = {
  AT_MOST_ONCE: 0,   // Fire-and-forget (sensor data)
  AT_LEAST_ONCE: 1,  // Guaranteed delivery (status updates)
  EXACTLY_ONCE: 2,   // Critical messages (emergency alerts)
};

const EXPIRY = {
  TRAFFIC_CONGESTION: 60,
  TRAFFIC_INCIDENT: 3600,
  TRAFFIC_LIGHT: 120,
  ENVIRONMENT_READING: 300,
  ENVIRONMENT_ALERT: 3600,
  EMERGENCY_ALERT: 7200,
  EMERGENCY_DISPATCH: 3600,
  SYSTEM_HEARTBEAT: 30,
  SUMMARY: 600,
};

const FLOW_CONTROL = {
  RECEIVE_MAXIMUM: 10,
  MAX_PACKET_SIZE: 4096,
  PUBLISH_RATE_LIMIT: 50,
  QUEUE_MAX_SIZE: 1000,
};

// ── Flow-controlled publisher wrapper ───────────────────────────────────────
class FlowControlledPublisher {
  constructor(client, options = {}) {
    this.client = client;
    this.maxInflight = options.maxInflight || FLOW_CONTROL.RECEIVE_MAXIMUM;
    this.rateLimit = options.rateLimit || FLOW_CONTROL.PUBLISH_RATE_LIMIT;
    this.inflightCount = 0;
    this.queue = [];
    this.publishCount = 0;
    this.windowStart = Date.now();
    this.totalPublished = 0;
    this.totalQueued = 0;
  }

  publish(topic, payload, options = {}) {
    // Rate limiting check
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.publishCount = 0;
      this.windowStart = now;
    }

    if (this.inflightCount >= this.maxInflight || this.publishCount >= this.rateLimit) {
      if (this.queue.length < FLOW_CONTROL.QUEUE_MAX_SIZE) {
        this.queue.push({ topic, payload, options });
        this.totalQueued++;
      }
      return false;
    }

    this._doPublish(topic, payload, options);
    return true;
  }

  _doPublish(topic, payload, options) {
    const qos = options.qos || 0;
    if (qos > 0) this.inflightCount++;
    this.publishCount++;
    this.totalPublished++;

    this.client.publish(topic, payload, options, () => {
      if (qos > 0) this.inflightCount--;
      this._drainQueue();
    });
  }

  _drainQueue() {
    while (this.queue.length > 0 && this.inflightCount < this.maxInflight) {
      const msg = this.queue.shift();
      this._doPublish(msg.topic, msg.payload, msg.options);
    }
  }

  getStats() {
    return {
      inflight: this.inflightCount,
      queueDepth: this.queue.length,
      totalPublished: this.totalPublished,
      totalQueued: this.totalQueued,
      rateLimit: this.rateLimit,
      maxInflight: this.maxInflight,
    };
  }
}

module.exports = { QOS, EXPIRY, FLOW_CONTROL, FlowControlledPublisher };
