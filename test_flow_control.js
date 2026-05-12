const mqtt = require('mqtt');
const { FlowControlledPublisher } = require('./mqtt/shared/mqttFeatures');

// Configuration
const BROKER_URL = 'mqtt://localhost:1884';
const LIMIT = 50; // Kembali ke limit 50
const BURST_COUNT = 150; // Tembak 150 pesan

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
    console.log('Connected to broker for Flow Control Test');
    
    // Initialize publisher with 50 msgs/sec limit
    const flowCtrl = new FlowControlledPublisher(client, { rateLimit: LIMIT });

    console.log(`Starting burst of ${BURST_COUNT} messages (Limit is ${LIMIT}/sec)...`);
    
    let immediateCount = 0;
    let queuedCount = 0;

    for (let i = 1; i <= BURST_COUNT; i++) {
        const success = flowCtrl.publish('test/flow-control', JSON.stringify({ id: i, data: 'burst test' }));
        if (success) {
            immediateCount++;
        } else {
            queuedCount++;
        }
    }

    console.log('\n--- BURST RESULTS ---');
    console.log(`Target: ${BURST_COUNT} messages`);
    console.log(`Published Immediately: ${immediateCount}`);
    console.log(`Entered Queue: ${queuedCount}`);
    
    console.log('\n--- OBSERVING DRAIN (50 messages per second) ---');
    
    // Check periodically
    const interval = setInterval(() => {
        const currentStats = flowCtrl.getStats();
        console.log(`[${new Date().toLocaleTimeString()}] Queue Depth: ${currentStats.queueDepth} | Total Published: ${currentStats.totalPublished}`);
        
        if (currentStats.queueDepth === 0) {
            console.log('\n✅ All messages drained and published!');
            clearInterval(interval);
            client.end();
            process.exit(0);
        }
    }, 500); // Check every 0.5s for smoother logs
});

client.on('error', (err) => {
    console.error('MQTT Error:', err);
    process.exit(1);
});
