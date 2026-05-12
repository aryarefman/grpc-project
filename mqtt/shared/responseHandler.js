// ============================================================================
// NovaPulse MQTT - Response Handler (MQTT 5.0)
// Publisher-side: listens for requests on per-publisher topic, sends response
// Uses MQTT 5.0 properties: responseTopic, correlationData, userProperties
// ============================================================================

const chalk = require('chalk');
const { TOPICS } = require('./topicRegistry');

class ResponseHandler {
  constructor(mqttClient, publisherId) {
    this.client = mqttClient;
    this.publisherId = publisherId;
  }

  // ── Register as a responder (per-publisher topic) ─────────────────────────
  setupHandler(callback) {
    // FIX Masalah 3: Subscribe ke topic SPESIFIK per publisher
    // Sebelumnya semua publisher subscribe ke 1 generic topic → 3 responses
    // Sekarang masing-masing publisher punya topic sendiri → 1 response
    const requestTopic = TOPICS.SYSTEM.COMMAND_REQUEST_TO(this.publisherId);
    this.client.subscribe(requestTopic, { qos: 1 });

    this.client.on('message', async (topic, payload, packet) => {
      if (topic !== requestTopic) return;

      let request;
      try { request = JSON.parse(payload.toString()); } catch { return; }

      // Fallback to simulated MQTT 5.0 properties from JSON body for v4 compatibility
      const responseTopic = request._responseTopic || packet.properties?.responseTopic;
      const correlationData = request._correlationData || packet.properties?.correlationData;

      if (!responseTopic || !correlationData) return;

      try {
        console.log(chalk.blue(`  (RR) Processing command: ${request.command}`));
        const responseData = await callback(request);
        if (!responseData) {
          console.log(chalk.gray(`  (RR) Command ignored (unsupported)`));
          return; 
        }
        
        if (responseData.error) {
          console.log(chalk.red(`  (RR) Command returned error: ${responseData.error}`));
        }

        // Send response with simulated correlation data
        this.client.publish(responseTopic, JSON.stringify({
          ...responseData,
          timestamp: Date.now(),
          _correlationData: correlationData,
          _props: {
            'response-to': correlationData.toString(),
            'source': this.publisherId,
          }
        }), { qos: 1 });
      } catch (err) {
        this.client.publish(responseTopic, JSON.stringify({
          error: err.message || 'Internal Error',
          _correlationData: correlationData,
        }), { qos: 1 });
      }
    });
  }
}

module.exports = ResponseHandler;
