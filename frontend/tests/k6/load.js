import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const submitTaskRequestFailed = new Counter('submit_task_request_failed');
const submitTaskRequestFailureRate = new Rate('submit_task_request_failure_rate');
const submitTaskRequestDuration = new Trend('submit_task_request_duration');
const serverSideTaskFailureCounter = new Counter('server_side_task_failure_count');


const taskData = new SharedArray('task_parameters', function () {
  const data = [];
  for (let i = 0; i < 1000; i++) {
    data.push({
      durationMs: Math.floor(Math.random() * 2000) + 100,
      shouldFail: Math.random() < 0.10,
    });
  }
  return data;
});

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
      ],
      gracefulStop: '10s',
    },
    constant_load: {
      executor: 'constant-vus',
      vus: 20,
      duration: '1m',
      startTime: '30s',
      gracefulStop: '10s',
    },
    spike_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      startTime: '1m30s',
      gracefulStop: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2500'],
    'submit_task_request_failure_rate': ['rate<0.05'],
    'submit_task_request_duration{status:202}': ['p(99)<3000'],
    'server_side_task_failure_count': ['count<500'],
  },
  ext: {
    loadtesting: {
      baseURL: __ENV.K6_APP_BASE_URL || 'http://localhost:3000',
    },
  },
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
};

export function setup() {
  console.log(`K6 test starting. Target base URL: ${options.ext.loadtesting.baseURL}`);
  return { startTimestamp: new Date().toISOString() };
}

export default function () {
  group('Submit Task and Monitor Metrics', () => {
    const baseURL = options.ext.loadtesting.baseURL;
    const submitTaskUrl = `${baseURL}/submit-task`;
    const metricsUrl = `${baseURL}/metrics`;

    const currentTaskParams = taskData[__VU * __ITER % taskData.length];

    const payload = JSON.stringify({
      taskId: `task-${__VU}-${__ITER}-${Date.now()}`,
      durationMs: currentTaskParams.durationMs,
      shouldFail: currentTaskParams.shouldFail,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: {
        scenario: __ENV.K6_SCENARIO || 'default_scenario',
        test_type: 'task_queue_load',
        task_should_fail: currentTaskParams.shouldFail ? 'true' : 'false',
      },
    };

    const startTime = Date.now();
    const res = http.post(submitTaskUrl, payload, params);
    const endTime = Date.now();
    const requestDuration = endTime - startTime;

    submitTaskRequestDuration.add(requestDuration, { status: res.status });

    const isAccepted = check(res, {
      'status is 202 Accepted': (r) => r.status === 202,
      'response contains message': (r) => r.json().message && r.json().message.includes('accepted'),
      'response contains queueStatus': (r) => r.json().queueStatus !== undefined,
    });

    if (!isAccepted) {
      submitTaskRequestFailed.add(1);
      submitTaskRequestFailureRate.add(1);
      console.error(`VU ${__VU} - Task submission FAILED for task ${payload.taskId}: Status ${res.status}, Body: ${res.body}`);
    } else {
      submitTaskRequestFailureRate.add(0);
    }

    if (currentTaskParams.shouldFail && isAccepted) {
      serverSideTaskFailureCounter.add(1);
    }

    if (__ITER % 20 === 0) {
      const metricsRes = http.get(metricsUrl, { tags: { check: 'metrics_scrape' } });
      check(metricsRes, {
        'metrics endpoint status is 200': (r) => r.status === 200,
        'metrics body is not empty': (r) => r.body.length > 0,
      });
    }
  });

  sleep(Math.random() * 0.5 + 0.5);
}

export function teardown(data) {
  console.log(`K6 test finished. Started at: ${data.startTimestamp}`);
  console.log('Teardown complete.');
}
