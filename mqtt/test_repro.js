const mqtt = require('mqtt');

console.log("Starting test_repro.js");

const client1 = mqtt.connect('mqtt://localhost:1884', {
  clientId: 'test-pub',
  protocolVersion: 4
});

const client2 = mqtt.connect('mqtt://localhost:1884', {
  clientId: 'test-sub',
  protocolVersion: 4
});

client2.on('connect', () => {
  console.log('client2 connected, subscribing...');
  client2.subscribe('test/topic', { qos: 1 }, (err) => {
     if (err) console.error("Sub error:", err);
     else console.log("client2 subscribed.");
  });
});

client2.on('message', (topic, msg, packet) => {
  console.log('RECEIVED TOPIC:', topic);
  console.log('RECEIVED PROPS:', packet.properties);
  process.exit(0);
});

client2.on('error', err => console.error("client2 err:", err));
client1.on('error', err => console.error("client1 err:", err));

client1.on('connect', () => {
  console.log('client1 connected, publishing in 1s...');
  setTimeout(() => {
    console.log("client1 publishing...");
    client1.publish('test/topic', 'hello', {
      qos: 1,
      properties: { userProperties: { 'foo': 'bar' }, messageExpiryInterval: 10 }
    }, (err) => {
       if (err) console.error("Pub err:", err);
       else console.log("client1 publish callback OK");
    });
  }, 1000);
});
