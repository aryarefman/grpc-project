const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { chalk, withSpinner, prompt, rl, printHeader, coolPrint, animateValue, pulseMessage, shutdownSequence, bootSequence, printTable, drawAsciiChart, drawVerticalChart, drawSparkline, drawMatrix } = require('./ui');

const PROTO_PATH = path.join(__dirname, '..', 'protos', 'environment.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef);

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || 'localhost:50051';
const client = new proto.citynexus.environment.EnvironmentService(
  SERVER_ADDRESS, grpc.credentials.createInsecure()
);

function printMenu() {
  const W = 40; // lebar konten visible — item terpanjang 37 char
  const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
  const row = (colored) => {
    const pad = W - strip(colored).length;
    return chalk.green('║ ') + colored + ' '.repeat(Math.max(0, pad)) + chalk.green(' ║');
  };

  console.log(chalk.green('╔' + '═'.repeat(W + 2) + '╗'));
  console.log(row(chalk.white.bold('ENVIRONMENT MONITOR PROTOCOLS')));
  console.log(chalk.green('╠' + '═'.repeat(W + 2) + '╣'));
  console.log(row(chalk.cyan('[1] List all sensors')));
  console.log(row(chalk.cyan('[2] Get sensor reading')));
  console.log(row(chalk.cyan('[3] Register new sensor')));
  console.log(row(chalk.cyan('[4] Remove sensor')));
  console.log(row(chalk.cyan('[5] Get area report')));
  console.log(row(chalk.yellow('[6] Live sensor stream (bidi streaming)')));
  console.log(row(chalk.gray('[0] Exit')));
  console.log(chalk.green('╚' + '═'.repeat(W + 2) + '╝'));
}

async function listSensors() {
  try {
    const response = await withSpinner('Fetching sensors...', new Promise((resolve, reject) => {
      client.ListSensors({}, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    const headers = ['ID', 'Name', 'Type', 'Zone', 'Reading', 'Quality', 'Status'];
    const rows = response.sensors.map(s => {
      let qualClr = chalk.white;
      if (s.quality_level === 'GOOD') qualClr = chalk.green;
      else if (s.quality_level === 'MODERATE') qualClr = chalk.yellow;
      else if (s.quality_level === 'POOR') qualClr = chalk.red;
      else if (s.quality_level === 'HAZARDOUS') qualClr = chalk.bgRed.white;

      return [
        chalk.cyan(s.sensor_id),
        chalk.white(s.name),
        chalk.magenta(s.type),
        chalk.yellow(s.zone),
        chalk.white(`${s.value} ${s.unit}`),
        qualClr(`[${s.quality_level}]`),
        chalk.green(s.status)
      ];
    });

    console.log(chalk.green('\n  ❖ ALL ENVIRONMENT SENSORS '));
    printTable(headers, rows, { borderColor: chalk.green });

    // Vertical sensor risk distribution (normalized to risk %)
    const chartData = response.sensors.slice(0, 8).map(s => {
      let riskLevel = 20; // Default OK
      if (s.quality_level === 'HAZARDOUS') riskLevel = 95;
      else if (s.quality_level === 'POOR') riskLevel = 85;
      else if (s.quality_level === 'MODERATE') riskLevel = 55;
      else if (s.quality_level === 'GOOD') riskLevel = 30;

      // Clean labels: AQ-Sudir, TMP-Tham, etc.
      const shortName = s.name
        .replace('Sensor ', '')
        .replace('Sudirman', 'Sdir')
        .replace('Thamrin', 'Tham')
        .replace('Kuningan', 'Kuni')
        .replace('Mangga Dua', 'M2')
        .replace('Kemang', 'Kmng')
        .replace('Ciliwung', 'Clwg')
        .replace('AQ-', 'AIR-')
        .replace('Temp-', 'TMP-')
        .replace('Humidity-', 'HUM-')
        .replace('Noise-', 'NOS-')
        .replace('Water-', 'WTR-');

      return {
        label: shortName.substring(0, 10),
        value: riskLevel
      };
    });
    drawVerticalChart(chartData, { title: 'RELATIVE SENSOR RISK DISTRIBUTION (0-100%)', height: 8 });
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function getSensorReading() {
  const id = await prompt('Enter sensor ID: ');
  try {
    const reading = await withSpinner(`Fetching reading for ${id.trim()}...`, new Promise((resolve, reject) => {
      client.GetSensorReading({ sensor_id: id.trim() }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    await pulseMessage(`\n[ SENSOR READING: ${reading.sensor_id} ]`, chalk.green.bold, 2);
    console.log(chalk.cyan(`  Name:         ${chalk.white(reading.name)}`));
    console.log(chalk.cyan(`  Type:         ${chalk.white(reading.type)}`));
    console.log(chalk.cyan(`  Location:     ${chalk.white(reading.location)}`));
    console.log(chalk.cyan(`  Zone:         ${chalk.white(reading.zone)}`));
    await animateValue('  Current Value', reading.value, ` ${reading.unit}`);
    
    let qualClr = chalk.white;
    if (reading.quality_level === 'GOOD') qualClr = chalk.green;
    else if (reading.quality_level === 'MODERATE') qualClr = chalk.yellow;
    else if (reading.quality_level === 'POOR') qualClr = chalk.red;
    else if (reading.quality_level === 'HAZARDOUS') qualClr = chalk.bgRed.white;
    
    console.log(chalk.cyan(`  Quality:      ${qualClr(`[ ${reading.quality_level} ]`)}`));
    console.log(chalk.cyan(`  Status:       ${chalk.white(reading.status)}`));
    console.log(chalk.cyan(`  Last Reading: ${chalk.white(new Date(Number(reading.last_reading_at)).toLocaleString())}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function registerSensor() {
  const name = await prompt('Sensor name: ');
  const type = await prompt('Type (AIR_QUALITY/TEMPERATURE/HUMIDITY/NOISE/WATER_QUALITY): ');
  const location = await prompt('Location: ');
  const zone = await prompt('Zone (NORTH/SOUTH/CENTRAL/EAST/WEST): ');

  try {
    const response = await withSpinner('Registering sensor...', new Promise((resolve, reject) => {
      client.RegisterSensor({
        name: name.trim(),
        type: type.trim().toUpperCase(),
        location: location.trim(),
        zone: zone.trim().toUpperCase(),
        latitude: -6.2 + Math.random() * 0.1,
        longitude: 106.8 + Math.random() * 0.1,
      }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ SUCCESS ${response.message}`));
    console.log(chalk.cyan(`  Sensor ID: ${chalk.white(response.sensor_id)}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function removeSensor() {
  const id = await prompt('Sensor ID to remove: ');
  try {
    const response = await withSpinner(`Removing sensor ${id.trim()}...`, new Promise((resolve, reject) => {
      client.RemoveSensor({ sensor_id: id.trim() }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    console.log(chalk.green(`\n✔ SUCCESS ${response.message}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function getAreaReport() {
  const zone = await prompt('Zone (NORTH/SOUTH/CENTRAL/EAST/WEST/ALL): ');
  try {
    const report = await withSpinner(`Generating report for ${zone.trim().toUpperCase() || 'ALL'}...`, new Promise((resolve, reject) => {
      client.GetAreaReport({ zone: zone.trim().toUpperCase() || 'ALL' }, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    }));

    let qualClr = chalk.white;
    if (report.overall_quality === 'EXCELLENT' || report.overall_quality === 'GOOD') qualClr = chalk.green;
    else if (report.overall_quality === 'MODERATE') qualClr = chalk.yellow;
    else if (report.overall_quality === 'POOR') qualClr = chalk.red;
    else if (report.overall_quality === 'HAZARDOUS') qualClr = chalk.bgRed.white;

    console.log(chalk.green(`\n[ AREA REPORT: ${report.zone} ]`));
    printTable(
      ['Metric', 'Value'],
      [
        ['Overall Quality', qualClr(report.overall_quality)],
        ['Active Sensors', report.active_sensors],
        ['Avg AQI', report.avg_air_quality_index],
        ['Avg Temp', report.avg_temperature + ' C'],
        ['Avg Humidity', report.avg_humidity + ' %'],
        ['Avg Noise', report.avg_noise_level + ' dB'],
        ['Alerts Count', chalk.red(report.alerts_count)]
      ],
      { borderColor: chalk.green }
    );

    const metricsData = [
      { label: 'AQI Index', value: Number(report.avg_air_quality_index) },
      { label: 'Temperature (C)', value: Number(report.avg_temperature) },
      { label: 'Humidity (%)', value: Number(report.avg_humidity) },
      { label: 'Noise (dB)', value: Number(report.avg_noise_level) }
    ];
    drawAsciiChart(metricsData, { title: 'AREA METRICS VISUALIZATION', width: 30, maxValue: 150 });
    
    // New: Accurate Status Dashboard from server data with real numbers
    const sensorNames = (report.sensor_readings || []).map(s => s.name);
    const qualities = (report.sensor_readings || []).map(s => s.quality_level);
    const values = (report.sensor_readings || []).map(s => `${s.value} ${s.unit}`);
    drawMatrix([], { title: 'SENSOR STATUS DASHBOARD', cols: 2, sensorNames, qualities, values });

    console.log(chalk.cyan(`  Timestamp:         ${chalk.white(new Date(Number(report.generated_at)).toLocaleString())}`));
  } catch (err) {
    console.log(chalk.red(`\n✖ ERROR ${err.message}`));
  }
}

async function liveSensorStream() {
  console.log(chalk.magenta('\n▶ STREAM Starting Bi-directional Sensor Stream...'));
  console.log(chalk.gray('This simulates IoT sensors sending data to the server.'));
  console.log(chalk.gray('Server sends back alerts when thresholds are exceeded.\n'));

  const sensors = await new Promise((resolve) => {
    client.ListSensors({}, (err, response) => {
      if (err) return resolve([]);
      resolve(response.sensors || []);
    });
  });

  if (sensors.length === 0) {
    console.log(chalk.red('[!] No sensors available. Register sensors first.'));
    return;
  }

  const call = client.LiveSensorStream();
  let streamActive = true;

  call.on('data', (alert) => {
    const time = new Date(Number(alert.timestamp)).toLocaleTimeString();
    
    let alertClr = chalk.white;
    if (alert.severity === 'INFO') alertClr = chalk.cyan;
    if (alert.severity === 'WARNING') alertClr = chalk.yellow;
    if (alert.severity === 'CRITICAL') alertClr = chalk.bgRed.white;

    console.log(chalk.gray(`\n[${time}]`) + alertClr(` [ ALERT FROM SERVER ]`));
    console.log(chalk.cyan(`  Type:     ${chalk.white(alert.alert_type)}`));
    console.log(chalk.cyan(`  Severity: ${alertClr(alert.severity)}`));
    console.log(chalk.cyan(`  Sensor:   ${chalk.white(alert.sensor_name)} (${alert.sensor_id})`));
    console.log(chalk.cyan(`  Message:  ${chalk.white(alert.message)}`));
    console.log(chalk.cyan(`  Value:    ${chalk.white(alert.current_value)} (threshold: ${alert.threshold_value})`));
  });

  call.on('error', (err) => {
    if (err.code !== grpc.status.CANCELLED) {
      console.log(chalk.red(`✖ STREAM ERROR ${err.message}`));
    }
    streamActive = false;
  });

  call.on('end', () => {
    console.log(chalk.gray('⏹ STREAM ENDED Server disconnected'));
    streamActive = false;
  });

  let messageCount = 0;
  const interval = setInterval(() => {
    if (!streamActive) {
      clearInterval(interval);
      return;
    }

    const sensor = sensors[Math.floor(Math.random() * sensors.length)];

    let value;
    const shouldExceed = Math.random() < 0.3; 
    switch (sensor.type) {
      case 'AIR_QUALITY': value = shouldExceed ? 120 + Math.random() * 80 : 20 + Math.random() * 80; break;
      case 'TEMPERATURE': value = shouldExceed ? 36 + Math.random() * 8 : 24 + Math.random() * 10; break;
      case 'HUMIDITY': value = shouldExceed ? 82 + Math.random() * 15 : 40 + Math.random() * 35; break;
      case 'NOISE': value = shouldExceed ? 72 + Math.random() * 20 : 30 + Math.random() * 35; break;
      case 'WATER_QUALITY': value = shouldExceed ? 10 + Math.random() * 25 : 50 + Math.random() * 50; break;
      default: value = Math.random() * 100;
    }

    value = Math.round(value * 10) / 10;
    messageCount++;

    try {
      call.write({
        sensor_id: sensor.sensor_id,
        value: value,
        timestamp: Date.now(),
        metadata: { source: 'cli_client', msg_num: String(messageCount) },
      });

      const time = new Date().toLocaleTimeString();
      console.log(chalk.gray(`[${time}]`) + chalk.blue(` [TX] Sent #${messageCount}: ${sensor.name} = ${value} ${sensor.unit}`));
    } catch (err) {
      clearInterval(interval);
    }
  }, 2000);

  await prompt('\nPress Enter to stop streaming...');
  clearInterval(interval);
  streamActive = false;

  try { call.end(); } catch (err) {}
  console.log(chalk.yellow('⏹ STREAM STOPPED'));
}

async function main() {
  await bootSequence('Environment Node');
  printHeader('NovaPulse - Environment Monitor Client');

  while (true) {
    printMenu();
    const choice = await prompt('\n> Choose option: ');

    switch (choice.trim()) {
      case '1': await listSensors(); break;
      case '2': await getSensorReading(); break;
      case '3': await registerSensor(); break;
      case '4': await removeSensor(); break;
      case '5': await getAreaReport(); break;
      case '6': await liveSensorStream(); break;
      case '0':
        await shutdownSequence();
        rl.close();
        process.exit(0);
      default:
        console.log(chalk.red('✖ ERROR Invalid option. Please try again.'));
    }
    console.log('');
  }
}

main().catch(err => {
  console.error(chalk.red(err));
});
