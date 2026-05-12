const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1884', {
  clientId: 'test-v5-revert',
  protocolVersion: 4
});

client.on('connect', () => {
  console.log('✅ Connected v5 with mqtt@4.3.8');
  client.publish('test/v5', JSON.stringify({ msg: 'hello' }), {
    properties: {
      userProperties: { 'test-key': 'test-value' },
      messageExpiryInterval: 10
    }
  }, (err) => {
    if (err) console.error('❌ Publish failed:', err);
    else console.log('✅ Published with properties');
    client.end();
  });
});

client.on('error', (err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

