// ============================================================================
// NovaPulse - Automated Traffic Blocking Test
// Demonstrates: Critical Env reading -> Automatic Traffic Block (Red Lights)
// ============================================================================

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_OPTIONS = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true };
const SERVER_ADDRESS = 'localhost:50051';

// Load Protos
const trafficProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, 'protos', 'traffic.proto'), PROTO_OPTIONS)
);
const envProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, 'protos', 'environment.proto'), PROTO_OPTIONS)
);

// Create Clients
const trafficClient = new trafficProto.citynexus.traffic.TrafficService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const envClient = new envProto.citynexus.environment.EnvironmentService(SERVER_ADDRESS, grpc.credentials.createInsecure());

async function runTest() {
  console.log('🚀 Starting NovaPulse Traffic Blocking Test...\n');

  // 1. Subscribe to Traffic Updates to see the lights turning RED
  console.log('📡 Subscribing to Traffic Updates...');
  const trafficStream = trafficClient.MonitorTraffic({ zone: 'ALL' });
  
  let lightsBlocked = false;
  trafficStream.on('data', (update) => {
    if (update.event_type === 'LIGHT_CHANGE' && update.details.includes('AUTOMATED SAFETY BLOCK')) {
      console.log('\n🛑 [SUCCESS!] Traffic Blocked due to hazardous air:');
      console.log(`   Intersection:  ${update.name} (${update.intersection_id})`);
      console.log(`   New Light:     ${update.current_light}`);
      console.log(`   Reason:        ${update.details}`);
      lightsBlocked = true;
    }
  });

  // Wait a bit for the stream to stabilize
  await new Promise(r => setTimeout(r, 1000));

  // 2. Fetch a sensor of type AIR_QUALITY in CENTRAL zone
  console.log('🌿 Fetching an Air Quality sensor in CENTRAL Zone...');
  const sensorsResponse = await new Promise((resolve) => {
    envClient.ListSensors({}, (err, res) => resolve(res.sensors || []));
  });
  
  const targetSensor = sensorsResponse.find(s => s.type === 'AIR_QUALITY' && s.zone === 'CENTRAL');

  if (!targetSensor) {
    console.error('❌ Could not find an Air Quality sensor in CENTRAL zone for testing.');
    process.exit(1);
  }

  // 3. Send a CRITICAL air quality reading (AQI > 200) via Bi-directional Stream
  console.log(`📡 Sending CRITICAL Air Quality reading (AQI: 250) for sensor: ${targetSensor.name}`);
  const envStream = envClient.LiveSensorStream();
  
  envStream.write({
    sensor_id: targetSensor.sensor_id,
    value: 250.0,
    timestamp: Date.now(),
    metadata: { test: 'true' }
  });

  // 4. Wait for the automatic block to be received via the stream
  console.log('\n⏳ Waiting for Orchestration Engine to process...');
  
  let attempts = 0;
  while (!lightsBlocked && attempts < 10) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (lightsBlocked) {
    console.log('\n🎯 Traffic Block Test Passed!');
  } else {
    console.log('\n❌ Traffic Block Test Timed Out.');
  }

  trafficStream.cancel();
  envStream.end();
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
