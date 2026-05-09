// ============================================================================
// NovaPulse MQTT - Request/Response Handler (MQTT 5.0)
// Uses responseTopic + correlationData for request-response pattern
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const { TOPICS } = require('./topicRegistry');

class RequestResponseHandler {
  constructor(mqttClient) {
    this.client = mqttClient;
    this.pendingRequests = new Map();
  }

  // ── Send a request and wait for response ──────────────────────────────
  async sendRequest(command, params = {}, timeoutMs = 5000) {
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
        // Then publish the request
        this.client.publish(
          TOPICS.SYSTEM.COMMAND_REQUEST,
          JSON.stringify({ 
            command, 
            params, 
            timestamp: Date.now(),
            _props: {
              responseTopic: responseTopic,
              correlationData: correlationId,
              userProperties: {
                'request-id': correlationId,
                'source': 'command-center',
              }
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
    
    const correlationData = data._props?.correlationData;
    if (!correlationData) return false;

    const correlationId = correlationData.toString();
    const pending = this.pendingRequests.get(correlationId);
    if (!pending) return false;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(correlationId);
    this.client.unsubscribe(topic);

    try {
      pending.resolve(JSON.parse(payload.toString()));
    } catch {
      pending.resolve(payload.toString());
    }
    return true;
  }

  // ── Register as a request handler (publisher side) ────────────────────
  setupRequestHandler(callback) {
    this.client.subscribe(TOPICS.SYSTEM.COMMAND_REQUEST, { qos: 1 });
    this.client.on('message', (topic, payload, packet) => {
      if (topic !== TOPICS.SYSTEM.COMMAND_REQUEST) return;

      let request;
      try { request = JSON.parse(payload.toString()); } catch { return; }

      const responseTopic = request._props?.responseTopic;
      const correlationData = request._props?.correlationData;
      if (!responseTopic || !correlationData) return;

      const response = callback(request);
      
      // Embed properties in response
      const responsePayload = {
        ...response,
        _props: {
          correlationData,
          userProperties: {
            'response-to': correlationData,
            'source': this.client.options?.clientId || 'unknown',
          }
        }
      };

      this.client.publish(responseTopic, JSON.stringify(responsePayload), { qos: 1 });
    });
  }
}

module.exports = RequestResponseHandler;
