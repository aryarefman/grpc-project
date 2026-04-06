// ============================================================================
// NovaPulse - Automated Orchestration Test
// Demonstrates: Traffic Incident -> Automatic Emergency Alert
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
const emergencyProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, 'protos', 'emergency.proto'), PROTO_OPTIONS)
);

// Create Clients
const trafficClient = new trafficProto.citynexus.traffic.TrafficService(SERVER_ADDRESS, grpc.credentials.createInsecure());
const emergencyClient = new emergencyProto.citynexus.emergency.EmergencyService(SERVER_ADDRESS, grpc.credentials.createInsecure());

async function runTest() {
  console.log('🚀 Starting NovaPulse Orchestration Test...\n');

  // 1. Subscribe to Emergency Alerts to see the automatic trigger
  console.log('📡 Subscribing to Emergency Alerts...');
  const emergencyStream = emergencyClient.SubscribeAlerts({ zone: 'ALL', min_severity: 'LOW' });
  
  let alertReceived = false;
  emergencyStream.on('data', (event) => {
    if (event.event_type === 'NEW_ALERT' && event.description.includes('AUTOMATIC ALERT')) {
      console.log('\n🔥 [SUCCESS!] Automation Triggered:');
      console.log(`   Event ID:    ${event.event_id}`);
      console.log(`   Alert Type:  ${event.alert_type}`);
      console.log(`   Severity:    ${event.severity}`);
      console.log(`   Description: ${event.description}`);
      alertReceived = true;
    }
  });

  // Wait a bit for the stream to stabilize
  await new Promise(r => setTimeout(r, 1000));

  // 2. Report a HIGH severity traffic incident
  console.log('🚦 Reporting HIGH Severity Traffic Incident at Jl. Sudirman (INT-001)...');
  
  trafficClient.ReportIncident({
    intersection_id: 'INT-001',
    type: 'ACCIDENT',
    severity: 'HIGH',
    description: 'Multi-vehicle collision on main road.',
    reported_by: 'TestSystem'
  }, (err, response) => {
    if (err) {
      console.error('❌ Error reporting incident:', err.message);
      process.exit(1);
    }
    console.log(`✅ Incident Reported: ${response.incident_id}`);
  });

  // 3. Wait for the automatic alert to be received via the stream
  console.log('\n⏳ Waiting for Orchestration Engine to process...');
  
  let attempts = 0;
  while (!alertReceived && attempts < 10) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  if (alertReceived) {
    console.log('\n🎯 Orchestration Test Passed!');
  } else {
    console.log('\n❌ Orchestration Test Timed Out.');
  }

  emergencyStream.cancel();
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
