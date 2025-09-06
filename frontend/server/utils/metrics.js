// metrics.js

const promClient = require('prom-client');

const ENABLE_PROMETHEUS_METRICS = process.env.ENABLE_PROMETHEUS_METRICS === 'true';

let metricsRegistry = null;

let isMetricsInitialized = false;

if (ENABLE_PROMETHEUS_METRICS) {
  try {
    metricsRegistry = new promClient.Registry();

    promClient.collectDefaultMetrics({
      register: metricsRegistry,
      prefix: 'nodejs_',
      timeout: 5000,
    });

    isMetricsInitialized = true;
    console.log('✅ Prometheus metrics initialized and default metrics enabled.');
  } catch (error) {
    console.error('❌ FATAL: Failed to initialize Prometheus metrics.', {
      message: error.message,
      stack: error.stack,
    });
    metricsRegistry = null;
    isMetricsInitialized = false;
  }
} else {
  console.warn('⚠️ Prometheus metrics are DISABLED via ENABLE_PROMETHEUS_METRICS environment variable.');
}

async function getMetrics() {
  if (!isMetricsInitialized || !metricsRegistry) {
    console.warn('Attempted to retrieve metrics, but Prometheus metrics are not initialized or enabled.');
    return '# Prometheus metrics are currently disabled or failed to initialize.\n';
  }
  try {
    return await metricsRegistry.metrics();
  } catch (error) {
    console.error('❌ Error retrieving Prometheus metrics.', {
      message: error.message,
      stack: error.stack,
    });
    return `# Error retrieving metrics: ${error.message}\n`;
  }
}

module.exports.promClient = promClient;

module.exports.metricsRegistry = metricsRegistry;

module.exports.isMetricsInitialized = isMetricsInitialized;

module.exports.getMetrics = getMetrics;
