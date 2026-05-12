const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { chalk, delay, prompt, rl, printHeader, drawProgressBar, animateValue, pulseMessage, gradientColors, shutdownSequence, taskSequence, bootSequence, drawAsciiChart, drawVerticalChart, animateProgressBar } = require('./ui');

const PROTO_OPTIONS = {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
};

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || 'localhost:50060';

const trafficProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'traffic.proto'), PROTO_OPTIONS)
);
const envProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'environment.proto'), PROTO_OPTIONS)
);
const emergencyProto = grpc.loadPackageDefinition(
  protoLoader.loadSync(path.join(__dirname, '..', 'protos', 'emergency.proto'), PROTO_OPTIONS)
);

const trafficClient = new trafficProto.citynexus.traffic.TrafficService(
  SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const envClient = new envProto.citynexus.environment.EnvironmentService(
  SERVER_ADDRESS, grpc.credentials.createInsecure()
);
const emergencyClient = new emergencyProto.citynexus.emergency.EmergencyService(
  SERVER_ADDRESS, grpc.credentials.createInsecure()
);

function printDashboard() {
  console.log(chalk.cyan('+' + '-'.repeat(74) + '+'));
  console.log(chalk.cyan('|') + chalk.white.bold('  COMMANDS:                                                                ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.white('  [1] City Overview (all services summary)                                 ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.white('  [2] Live Monitoring (with AI Orchestration)                              ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.white('  [3] Quick: Create emergency + dispatch unit                              ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.white('  [4] Quick: Report traffic incident (Triggers Emergency!)                 ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.white('  [5] Quick: Simulate sensor burst (Triggers Traffic Block!)               ') + chalk.cyan('|'));
  console.log(chalk.cyan('|') + chalk.gray('  [0] Exit                                                                 ') + chalk.cyan('|'));
  console.log(chalk.cyan('+' + '-'.repeat(74) + '+'));
}

function callAsync(client, method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// Custom specialized spinner for dashboard parallel tasks
async function dashboardLoading(text) {
  let i = 0;
  const spinners = ['[>   ]', '[>>  ]', '[>>> ]', '[ >>>]', '[  >>]', '[   >]', '[    ]'];
  process.stdout.write('\x1B[?25l');
  const interval = setInterval(() => {
    const color = gradientColors[i % gradientColors.length];
    process.stdout.write(`\r${color(spinners[i % spinners.length])} ${chalk.white(text)}`);
    i++;
  }, 100);
  
  return {
    succeed: (msg) => {
      clearInterval(interval);
      process.stdout.write(`\r${chalk.green('✔')} ${chalk.white(msg)}\n`);
      process.stdout.write('\x1B[?25h');
    },
    fail: (msg) => {
      clearInterval(interval);
      process.stdout.write(`\r${chalk.red('✖')} ${chalk.white(msg)}\n`);
      process.stdout.write('\x1B[?25h');
    }
  };
}

async function cityOverview() {
  const loader = await dashboardLoading('Fetching city overview from all services...');
  await delay(1200); // Visual flair

  try {
    const [intersections, sensors, alerts, units] = await Promise.all([
      callAsync(trafficClient, 'ListIntersections', {}),
      callAsync(envClient, 'ListSensors', {}),
      callAsync(emergencyClient, 'ListActiveAlerts', {}),
      callAsync(emergencyClient, 'ListUnits', {}),
    ]);
    
    loader.succeed('City overview data fetched successfully!');

    const intList = intersections.intersections || [];
    const snsList = sensors.sensors || [];
    const altList = alerts.alerts || [];
    const unitList = units.units || [];

    const congested = intList.filter(i => i.congestion_level > 0.7).length;
    const blocked = intList.filter(i => i.status === 'BLOCKED').length;
    const avgCong = intList.reduce((sum, i) => sum + i.congestion_level, 0) / (intList.length || 1);

    await pulseMessage('\n◈ TRAFFIC STATUS SUMMARY', chalk.blue.bold, 2);
    await animateValue('  Total Intersections', intList.length);
    await animateValue('  Congested Intersections', congested);
    await animateValue('  Blocked Roads', blocked);
    await animateProgressBar('Average Congestion', avgCong, 1, 20);

    const onlineSensors = snsList.filter(s => s.status === 'ONLINE').length;
    const hazardous = snsList.filter(s => s.quality_level === 'HAZARDOUS' || s.quality_level === 'POOR').length;

    await pulseMessage('\n❖ ENVIRONMENT STATUS SUMMARY', chalk.green.bold, 2);
    await animateValue('  Total Sensors', snsList.length);
    await animateValue('  Online Sensors', onlineSensors);
    await animateProgressBar('Hazardous Level', hazardous, snsList.length || 1, 20);

    const critAlerts = altList.filter(a => a.severity === 'CRITICAL').length;
    const availUnits = unitList.filter(u => u.status === 'AVAILABLE').length;
    const dispUnits = unitList.filter(u => u.status === 'DISPATCHED' || u.status === 'EN_ROUTE' || u.status === 'ON_SCENE').length;

    await pulseMessage('\n▰ EMERGENCY STATUS SUMMARY', chalk.red.bold, 2);
    await animateValue('  Active Alerts', altList.length);
    await animateValue('  Critical Threats', critAlerts);
    await animateValue('  Available Units', availUnits);
    await animateProgressBar('Unit Deployment', dispUnits, unitList.length || 1, 20);

    console.log(chalk.gray('\n' + '-'.repeat(54)));
    console.log(chalk.white.bold('✔ SUMMARY COMPLETE'));
    console.log(chalk.gray('-'.repeat(54)));

    // --- VERTICAL CHARTS SECTION (Optimized Scaling & Labels) ---
    if (intList.length > 0) {
      const topIntersections = [...intList]
        .sort((a, b) => b.vehicle_count - a.vehicle_count)
        .slice(0, 5)
        .map(i => {
          // Clean labels: remove "Jl." or "Jl " and abbreviate
          const short = i.name
            .replace(/^Jl\.?\s*/i, '') // Remove Jl. or Jl
            .split(' × ')[0]          // Just take the first street for the chart
            .replace('Sudirman', 'Sudir')
            .replace('Gatot Subroto', 'Gatot')
            .replace('MH Thamrin', 'Thamrn')
            .replace('Ahmad Yani', 'AYani')
            .replace('Casablanca', 'Csblnc');
          return { label: short.substring(0, 8), value: i.vehicle_count };
        });
      
      const maxVehicles = Math.max(...topIntersections.map(d => d.value), 50);
      drawVerticalChart(topIntersections, { 
        title: 'TOP TRAFFIC DENSITY (Vehicles)', 
        height: 10,
        maxValue: maxVehicles
      });
    }

    const unitTypes = {};
    unitList.forEach(u => unitTypes[u.type] = (unitTypes[u.type] || 0) + 1);
    const unitChartData = Object.entries(unitTypes).map(([label, value]) => ({ 
      label: label.replace('AMBULANCE', 'AMB').replace('FIRE_TRUCK', 'FIRE').replace('POLICE', 'POL').replace('HAZMAT', 'HAZ').replace('RESCUE', 'RES'), 
      value 
    }));
    
    if (unitChartData.length > 0) {
        const maxUnits = Math.max(...unitChartData.map(d => d.value), 1);
        drawVerticalChart(unitChartData, { 
          title: 'EMERGENCY FLEET DISTRIBUTION (Active Units)', 
          height: 8,
          maxValue: maxUnits
        });
    }
    // ----------------------------

  } catch (err) {
    loader.fail(`Error fetching overview: ${err.message}`);
  }
}

async function liveMonitoring() {
  console.log(chalk.magenta('\n▶ Starting live monitoring from all services...'));
  console.log(chalk.gray('Demonstrating multi-client streaming capability.\n'));

  const trafficStream = trafficClient.MonitorTraffic({ zone: 'ALL' });
  trafficStream.on('data', (update) => {
    if (update.event_type === 'INITIAL_STATE') return;
    const time = new Date(Number(update.timestamp)).toLocaleTimeString();
    console.log(chalk.gray(`[${time}]`) + chalk.blue(' [TRAFFIC] ') + chalk.cyan(`${update.name} | [${update.event_type}] | `) + chalk.white(`Light: [${update.current_light}] | Cars: ${update.vehicle_count} | Cong: ${(update.congestion_level * 100).toFixed(0)}%`));
  });

  const emergencyStream = emergencyClient.SubscribeAlerts({ zone: 'ALL', min_severity: 'LOW' });
  emergencyStream.on('data', (event) => {
    if (event.event_type === 'EXISTING_ALERT') return;
    const time = new Date(Number(event.timestamp)).toLocaleTimeString();
    let sevClr = event.severity === 'CRITICAL' ? chalk.bgRed.white : event.severity === 'HIGH' ? chalk.red : event.severity === 'MEDIUM' ? chalk.yellow : chalk.green;
    console.log(chalk.gray(`[${time}]`) + chalk.red(' [EMERGENCY] ') + sevClr(`[${event.severity}]`) + chalk.white(` | [${event.event_type}] | ${event.alert_type} at ${event.location} | `) + chalk.cyan(event.description));
  });

  const envStream = envClient.LiveSensorStream();
  envStream.on('data', (alert) => {
    const time = new Date(Number(alert.timestamp)).toLocaleTimeString();
    let sevClr = alert.severity === 'CRITICAL' ? chalk.bgRed.white : alert.severity === 'WARNING' ? chalk.yellow : chalk.white;
    console.log(chalk.gray(`[${time}]`) + chalk.green(' [ENV ALERT] ') + sevClr(`[${alert.severity}]`) + chalk.white(` | ${alert.sensor_name} | `) + chalk.cyan(alert.message));
  });

  const sensors = await callAsync(envClient, 'ListSensors', {});
  const sensorList = sensors.sensors || [];

  const sensorInterval = setInterval(() => {
    if (sensorList.length > 0) {
      const sensor = sensorList[Math.floor(Math.random() * sensorList.length)];
      let value;
      switch (sensor.type) {
        case 'AIR_QUALITY': value = 20 + Math.random() * 180; break;
        case 'TEMPERATURE': value = 24 + Math.random() * 20; break;
        case 'HUMIDITY': value = 30 + Math.random() * 65; break;
        case 'NOISE': value = 30 + Math.random() * 70; break;
        default: value = Math.random() * 100;
      }
      try {
        envStream.write({
          sensor_id: sensor.sensor_id,
          value: Math.round(value * 10) / 10,
          timestamp: Date.now(),
        });
      } catch (err) {
        clearInterval(sensorInterval);
      }
    }
  }, 3000);

  [trafficStream, emergencyStream, envStream].forEach(stream => {
    stream.on('error', (err) => {
      if (err.code !== grpc.status.CANCELLED) {
        console.log(chalk.red(`[STREAM ERROR] ${err.message}`));
      }
    });
  });

  await prompt('\nPress Enter to stop monitoring...');

  clearInterval(sensorInterval);
  trafficStream.cancel();
  emergencyStream.cancel();
  try { envStream.end(); } catch (e) {}

  console.log(chalk.yellow('⏹ All streams stopped.'));
}

async function quickEmergency() {
  console.log(chalk.red('\n⚡ Quick Emergency Workflow'));
  console.log(chalk.gray('Creating alert and dispatching unit automatically...\n'));

  const types = ['FIRE', 'MEDICAL', 'CRIME', 'HAZMAT'];
  const locations = ['Jl. Sudirman', 'Jl. Thamrin', 'Jl. Kuningan', 'Jl. Kemang'];
  const zones = ['CENTRAL', 'NORTH', 'SOUTH', 'EAST'];

  try {
    await taskSequence([
      'Initializing Emergency Protocol',
      'Geolocating incident coordinates',
      'Generating alert signature',
    ]);

    const alert = await callAsync(emergencyClient, 'CreateAlert', {
      type: types[Math.floor(Math.random() * types.length)],
      severity: 'HIGH',
      location: locations[Math.floor(Math.random() * locations.length)],
      zone: zones[Math.floor(Math.random() * zones.length)],
      description: 'Automated emergency drill from dashboard',
      reporter_name: 'Dashboard System',
      reporter_contact: 'dashboard@citynexus.id',
      latitude: -6.2 + Math.random() * 0.1,
      longitude: 106.8 + Math.random() * 0.1,
    });
    console.log(chalk.green(`✔ Alert created: ${alert.alert_id}`));

    await taskSequence([
      'Scanning for available units',
      'Calculating closest responder ETA',
    ]);
    
    const unitsResponse = await callAsync(emergencyClient, 'ListUnits', {});
    const availableUnit = (unitsResponse.units || []).find(u => u.status === 'AVAILABLE');

    if (!availableUnit) {
      console.log(chalk.red('✖ No available units to dispatch'));
      return;
    }
    console.log(chalk.green(`✔ Found unit: ${availableUnit.name} (${availableUnit.unit_id})`));

    await taskSequence(['Transmitting dispatch coordinates']);
    const dispatch = await callAsync(emergencyClient, 'DispatchUnit', {
      alert_id: alert.alert_id,
      unit_id: availableUnit.unit_id,
    });
    console.log(chalk.green(`✔ Unit dispatched! ETA: ${dispatch.estimated_arrival}`));

    await taskSequence(['Simulating unit movement: EN_ROUTE']);
    await callAsync(emergencyClient, 'UpdateUnitStatus', {
      unit_id: availableUnit.unit_id,
      status: 'EN_ROUTE',
      notes: 'En route to location',
    });

    await taskSequence(['Simulating arrival: ON_SCENE']);
    const onScene = await callAsync(emergencyClient, 'UpdateUnitStatus', {
      unit_id: availableUnit.unit_id,
      status: 'ON_SCENE',
      notes: 'Arrived on scene',
    });
    console.log(chalk.green(`✔ Status: ${onScene.message}`));

    console.log(chalk.green('\n✔ EMERGENCY WORKFLOW COMPLETE'));
  } catch (err) {
    console.log(chalk.red(`\n✖ ${err.message}`));
  }
}

async function quickTrafficIncident() {
  console.log(chalk.yellow('\n⚡ Quick Traffic Incident'));

  try {
    const intResponse = await callAsync(trafficClient, 'ListIntersections', {});
    const intersections = intResponse.intersections || [];
    const target = intersections[Math.floor(Math.random() * intersections.length)];

    if (!target) {
      console.log(chalk.red('[FAIL] No intersections available'));
      return;
    }

    console.log(chalk.cyan(`  Target: ${chalk.white(target.name)} (${target.intersection_id})`));

    await taskSequence([
      'Analyzing traffic density',
      'Requesting emergency override',
      'Reporting incident to TrafficService',
    ]);

    const incident = await callAsync(trafficClient, 'ReportIncident', {
      intersection_id: target.intersection_id,
      type: 'ACCIDENT',
      severity: 'HIGH',
      description: `Multi-vehicle collision at ${target.name}`,
      reported_by: 'Dashboard System',
    });
    console.log(chalk.green(`✔ Incident reported: ${incident.incident_id}`));

    await taskSequence(['Modifying traffic light cycle (FORCED RED)']);
    const lightUpdate = await callAsync(trafficClient, 'UpdateTrafficLight', {
      intersection_id: target.intersection_id,
      new_light: 'RED',
      duration_seconds: 300,
      reason: 'Emergency: traffic incident',
    });
    console.log(chalk.green(`✔ Light changed! [${lightUpdate.previous_light}] -> [RED]`));

    console.log(chalk.green(`\n✔ TRAFFIC WORKFLOW COMPLETE`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ${err.message}`));
  }
}

async function sensorBurst() {
  console.log(chalk.green('\n⚡ Sensor Data Burst (Bi-directional Streaming Demo)'));
  console.log(chalk.gray('Sending 20 rapid sensor readings and watching for alerts...\n'));

  try {
    const sensors = await callAsync(envClient, 'ListSensors', {});
    const sensorList = sensors.sensors || [];

    if (sensorList.length === 0) {
      console.log(chalk.red('[FAIL] No sensors available'));
      return;
    }

    const call = envClient.LiveSensorStream();
    let alertCount = 0;

    call.on('data', (alert) => {
      alertCount++;
      let sevClr = alert.severity === 'CRITICAL' ? chalk.bgRed.white : alert.severity === 'WARNING' ? chalk.yellow : chalk.green;
      console.log(`  ` + sevClr(`[ ${alert.severity} ]`) + chalk.white(` Alert #${alertCount}: `) + chalk.cyan(alert.message));
    });

    for (let i = 0; i < 20; i++) {
      const sensor = sensorList[Math.floor(Math.random() * sensorList.length)];
      let value;
      switch (sensor.type) {
        case 'AIR_QUALITY': value = 100 + Math.random() * 100; break;
        case 'TEMPERATURE': value = 35 + Math.random() * 10; break;
        case 'HUMIDITY': value = 80 + Math.random() * 15; break;
        case 'NOISE': value = 70 + Math.random() * 25; break;
        default: value = Math.random() * 100;
      }

      call.write({
        sensor_id: sensor.sensor_id,
        value: Math.round(value * 10) / 10,
        timestamp: Date.now(),
        metadata: { burst: 'true', index: String(i + 1) },
      });

      console.log(chalk.gray(`  [TX] [${String(i + 1).padStart(2, ' ')}/20] `) + chalk.blue(`${sensor.name}: ${Math.round(value * 10) / 10} ${sensor.unit}`));
      await new Promise(r => setTimeout(r, 200));
    }

    const loader = await dashboardLoading('Waiting for server analysis...');
    await delay(2000);
    call.end();
    loader.succeed('Burst stream completed');

    console.log(chalk.green(`\n✔ Status: Sent 20 readings, received ${alertCount} alerts.`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ${err.message}`));
  }
}

function printNovapulseAscii() {
  const lines = [
    '  ███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗██╗      ███████╗███████╗',
    '  ████╗  ██║██╔═══██╗██║   ██║██╔══██╗██╔══██╗██║   ██║██║      ██╔════╝██╔════╝',
    '  ██╔██╗ ██║██║   ██║██║   ██║███████║██████╔╝██║   ██║██║      ███████╗█████╗  ',
    '  ██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║██╔═══╝ ██║   ██║██║      ╚════██║██╔══╝  ',
    '  ██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║██║     ╚██████╔╝███████╗ ███████║███████╗',
    '  ╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝╚═╝      ╚═════╝ ╚══════╝ ╚══════╝╚══════╝',
  ];

  const colors = [chalk.cyan, chalk.cyan, chalk.blue, chalk.blue, chalk.magenta, chalk.magenta];

  console.log('');
  lines.forEach((line, i) => {
    console.log(colors[i](line));
  });
  console.log(chalk.gray('  ' + '─'.repeat(80)));
  console.log(chalk.white.bold('                    ⚡ Unified Smart City Dashboard  v1.0 ⚡'));
  console.log(chalk.gray('  ' + '─'.repeat(80)));
  console.log('');
}

async function main() {
  await bootSequence('Dashboard Console');
  printNovapulseAscii();
  printHeader('NovaPulse - Unified Dashboard Client');

  while (true) {
    printDashboard();
    const choice = await prompt('\n> Choose option: ');

    switch (choice.trim()) {
      case '1': await cityOverview(); break;
      case '2': await liveMonitoring(); break;
      case '3': await quickEmergency(); break;
      case '4': await quickTrafficIncident(); break;
      case '5': await sensorBurst(); break;
      case '0':
        await shutdownSequence();
        rl.close();
        process.exit(0);
      default:
        console.log(chalk.red('✖ Invalid option.'));
    }
    console.log('');
  }
}

main().catch(err => {
  console.error(chalk.red(`✖ ${err.message || err}`));
});
