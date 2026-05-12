const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1884', {
  clientId: 'test-v5-sub',
  protocolVersion: 4
});

client.on('connect', () => {
  console.log('✅ Connected v5');
  client.subscribe('test/v5', { qos: 1 }, (err) => {
    if (err) console.error('❌ Subscribe failed:', err);
    else console.log('✅ Subscribed');
    client.end();
  });
});

client.on('error', (err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

