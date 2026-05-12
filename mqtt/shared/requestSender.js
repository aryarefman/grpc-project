// ============================================================================
// NovaPulse MQTT - Request Sender (MQTT 5.0)
// Subscriber-side: sends targeted requests to specific publishers
// Uses MQTT 5.0 properties: responseTopic, correlationData, userProperties
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { TOPICS } = require('./topicRegistry');

class RequestSender {
  constructor(mqttClient) {
    this.client = mqttClient;
    this.pendingRequests = new Map();

    // Listen for responses on ANY response topic
    this.client.on('message', (topic, payload, packet) => {
      if (!topic.startsWith('novapulse/system/command/response/')) return;

      let data;
      try { data = JSON.parse(payload.toString()); } catch { return; }
      
      // MQTT 5.0: Baca correlationData dari packet properties
      const correlationData = packet.properties?.correlationData;
      if (!correlationData) return;

      const correlationId = correlationData.toString();
      const pending = this.pendingRequests.get(correlationId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      this.client.unsubscribe(topic);

      pending.resolve(data);
    });
  }

  // ── Send a targeted request to a specific publisher ───────────────────
  // FIX Masalah 3: Kirim ke publisher spesifik, bukan broadcast
  // targetPublisherId: 'traffic-publisher' | 'environment-publisher' | 'emergency-publisher'
  async sendRequest(targetPublisherId, command, params = {}, timeoutMs = 5000) {
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
        // Step 2: Publish request to the TARGET publisher's specific topic
        const targetTopic = TOPICS.SYSTEM.COMMAND_REQUEST_TO(targetPublisherId);
        this.client.publish(
          targetTopic,
          JSON.stringify({ command, params, timestamp: Date.now() }),
          { 
            qos: 1,
            // MQTT 5.0: responseTopic & correlationData di packet properties
            properties: {
              responseTopic: responseTopic,
              correlationData: correlationId,
              userProperties: { 
                'request-id': correlationId, 
                'source': 'command-center',
                'target': targetPublisherId,
              }
            }
          }
        );
      });
    });
  }
}

module.exports = RequestSender;
