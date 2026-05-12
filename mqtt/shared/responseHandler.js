// ============================================================================
// NovaPulse MQTT - Response Handler (Simulation on MQTT 3.1.1)
// Simulates MQTT 5.0 Request-Response using application-level _props
// ============================================================================

const { TOPICS } = require('./topicRegistry');

class ResponseHandler {
  constructor(mqttClient) {
    this.client = mqttClient;
  }

  // ── Register as a responder ───────────────────────────────────────────────
  setupHandler(callback) {
    this.client.subscribe(TOPICS.SYSTEM.COMMAND_REQUEST, { qos: 1 });

    this.client.on('message', async (topic, payload) => {
      if (topic !== TOPICS.SYSTEM.COMMAND_REQUEST) return;

      let request;
      try { request = JSON.parse(payload.toString()); } catch { return; }

      // Read simulated MQTT 5.0 properties from JSON payload
      const responseTopic = request._props?.responseTopic;
      const correlationData = request._props?.correlationData;

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
          // We still send the error back so the dashboard knows what happened
        }

        
        // Send the response exactly to the requested private channel
        this.client.publish(responseTopic, JSON.stringify({
          ...responseData,
          timestamp: Date.now(),
          _props: {
            correlationData: correlationData,
            userProperties: {
              'response-to': correlationData,
              'source': this.client.options?.clientId || 'publisher',
            }
          }
        }), { qos: 1 });
      } catch (err) {
        this.client.publish(responseTopic, JSON.stringify({
          error: err.message || 'Internal Error',
          _props: { correlationData }
        }), { qos: 1 });
      }
    });
  }
}

module.exports = ResponseHandler;
