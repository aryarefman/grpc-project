// ============================================================================
// NovaPulse MQTT - Request Sender (Simulation on MQTT 3.1.1)
// Simulates MQTT 5.0 Request-Response using application-level _props
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { TOPICS } = require('./topicRegistry');

class RequestSender {
  constructor(mqttClient) {
    this.client = mqttClient;
    this.pendingRequests = new Map();

    // Listen for responses on ANY response topic
    this.client.on('message', (topic, payload) => {
      if (!topic.startsWith('novapulse/system/command/response/')) return;

      let data;
      try { data = JSON.parse(payload.toString()); } catch { return; }
      
      const correlationId = data._props?.correlationData;
      if (!correlationId) return;

      const pending = this.pendingRequests.get(correlationId.toString());
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId.toString());
      this.client.unsubscribe(topic);

      pending.resolve(data);
    });
  }

  // ── Send a request and wait for response ──────────────────────────────
  async sendRequest(command, params = {}, timeoutMs = 5000) {
    const correlationId = uuidv4().substring(0, 8);
    const responseTopic = TOPICS.SYSTEM.COMMAND_RESPONSE(correlationId);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        this.client.unsubscribe(responseTopic);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, timeout });

      // Step 1: Subscribe to the unique private response channel
      this.client.subscribe(responseTopic, { qos: 1 }, () => {
        // Step 2: Publish request to the generic request channel
        this.client.publish(
          TOPICS.SYSTEM.COMMAND_REQUEST,
          JSON.stringify({ 
            command, 
            params, 
            timestamp: Date.now(),
            // Simulating MQTT 5 properties
            _props: {
              responseTopic: responseTopic,
              correlationData: correlationId,
              userProperties: { 'request-id': correlationId, 'source': 'command-center' }
            }
          }),
          { qos: 1 }
        );
      });
    });
  }
}

module.exports = RequestSender;
