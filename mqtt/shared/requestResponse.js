// ============================================================================
// NovaPulse MQTT - Request/Response Handler (MQTT 5.0)
// Combined handler: uses MQTT 5.0 responseTopic + correlationData properties
// Per-publisher routing for 1:1 request-response
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { TOPICS } = require('./topicRegistry');

class RequestResponseHandler {
  constructor(mqttClient) {
    this.client = mqttClient;
    this.pendingRequests = new Map();
  }

  // ── Send a targeted request to a specific publisher ───────────────────
  async sendRequest(targetPublisherId, command, params = {}, timeoutMs = 5000) {
    const correlationId = uuidv4();
    const responseTopic = TOPICS.SYSTEM.COMMAND_RESPONSE(correlationId);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        this.client.unsubscribe(responseTopic);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, timeout });

      // Subscribe to response topic first
      this.client.subscribe(responseTopic, { qos: 1 }, () => {
        // Publish to target publisher's specific request topic
        this.client.publish(
          TOPICS.SYSTEM.COMMAND_REQUEST_TO(targetPublisherId),
          JSON.stringify({ 
            command, 
            params, 
            timestamp: Date.now(),
            _responseTopic: responseTopic,
            _correlationData: correlationId,
            _props: {
              'request-id': correlationId,
              'source': 'command-center',
              'target': targetPublisherId,
            }
          }),
          { qos: 1 }
        );
      });
    });
  }

  // ── Handle incoming responses (called from message handler) ───────────
  handleResponse(topic, payload, packet) {
    if (!topic.startsWith('novapulse/system/command/response/')) return false;
    let data;
    try { data = JSON.parse(payload.toString()); } catch { return false; }
    
    const correlationData = data._correlationData || packet.properties?.correlationData;
    if (!correlationData) return false;

    const correlationId = correlationData.toString();
    const pending = this.pendingRequests.get(correlationId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(correlationId);
    this.client.unsubscribe(topic);
    
    console.log(`⟵  RESPONSE matched correlationId: ${correlationId}`);

    pending.resolve(data);
    return true;
  }

  // ── Register as a request handler (publisher side) ────────────────────
  setupRequestHandler(publisherId, callback) {
    const requestTopic = TOPICS.SYSTEM.COMMAND_REQUEST_TO(publisherId);
    this.client.subscribe(requestTopic, { qos: 1 });

    this.client.on('message', (topic, payload, packet) => {
      if (topic !== requestTopic) return;

      let request;
      try { request = JSON.parse(payload.toString()); } catch { return; }

      const responseTopic = request._responseTopic || packet.properties?.responseTopic;
      const correlationData = request._correlationData || packet.properties?.correlationData;
      if (!responseTopic || !correlationData) return;

      const response = callback(request);
      
      this.client.publish(responseTopic, JSON.stringify({
        ...response,
        timestamp: Date.now(),
        _correlationData: correlationData,
        _props: {
          'response-to': correlationData.toString(),
          'source': publisherId,
        }
      }), { qos: 1 });
    });
  }
}

module.exports = RequestResponseHandler;
