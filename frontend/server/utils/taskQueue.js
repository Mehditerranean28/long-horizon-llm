const { promClient, metricsRegistry } = require('./metrics');

function createNoopMetric() {
  let value = 0;
  return {
    inc: (v = 1) => { value += v; },
    dec: (v = 1) => { value -= v; },
    observe: () => {},
    set: (v) => { value = v; },
    reset: () => { value = 0; },
    startTimer: () => () => {},
    async get() {
      return { values: [{ value }] };
    },
  };
}

const tasksQueuedGauge = metricsRegistry
  ? new promClient.Gauge({
      name: 'task_queue_queued_tasks_total',
      help: 'Total number of tasks currently waiting in the queue.',
      registers: [metricsRegistry],
    })
  : createNoopMetric();

const tasksActiveGauge = metricsRegistry
  ? new promClient.Gauge({
      name: 'task_queue_active_tasks_total',
      help: 'Total number of tasks currently executing.',
      registers: [metricsRegistry],
    })
  : createNoopMetric();

const taskDurationHistogram = metricsRegistry
  ? new promClient.Histogram({
      name: 'task_queue_task_duration_seconds',
      help: 'Duration of tasks executed by the TaskQueue in seconds.',
      buckets: promClient.exponentialBuckets(0.001, 2, 15),
      registers: [metricsRegistry],
    })
  : createNoopMetric();

const tasksFailedCounter = metricsRegistry
  ? new promClient.Counter({
      name: 'task_queue_failed_tasks_total',
      help: 'Total number of tasks that failed during execution.',
      registers: [metricsRegistry],
    })
  : createNoopMetric();

const tasksTimedOutCounter = metricsRegistry
  ? new promClient.Counter({
      name: 'task_queue_timed_out_tasks_total',
      help: 'Total number of tasks that timed out during execution.',
      registers: [metricsRegistry],
    })
  : createNoopMetric();


class TaskQueue {
  constructor(concurrency = 2, options = {}) {
    if (typeof concurrency !== 'number' || concurrency <= 0 || !Number.isInteger(concurrency)) {
      throw new Error('TaskQueue: Concurrency must be a positive integer.');
    }

    this.concurrency = concurrency;
    this.queue = [];
    this.activeCount = 0;
    this.nextTaskId = 0;

    this.taskTimeoutMs = options.taskTimeoutMs || 60000;
    this.maxQueueSize = options.maxQueueSize || Infinity;

    this.isDraining = false;
    this.drainPromises = [];
  }

  async add(task) {
    if (this.isDraining) {
      const error = new Error('TaskQueue is draining. No new tasks can be added.');
      console.warn(`TaskQueue: Attempted to add task while draining. Rejecting.`, error.message);
      return Promise.reject(error);
    }

    if (this.queue.length >= this.maxQueueSize) {
      const error = new Error(`TaskQueue: Queue full (max size ${this.maxQueueSize}).`);
      console.error(`TaskQueue: Failed to add task. Queue is full.`);
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      const taskId = this.nextTaskId++;
      const startTime = process.hrtime.bigint();

      this.queue.push({ taskId, task, resolve, reject, startTime });
      tasksQueuedGauge.inc();
      this._processQueue();
    });
  }

  _processQueue() {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      if (this.isDraining && this.activeCount === 0 && this.queue.length === 0) {
        this.drainPromises.forEach(resolve => resolve());
        this.drainPromises = [];
        console.log('TaskQueue: Successfully drained all tasks.');
      }
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }

    tasksQueuedGauge.dec();
    this.activeCount++;
    tasksActiveGauge.inc();

    let timeoutId;
    const taskPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        tasksTimedOutCounter.inc();
        const timeoutError = new Error(`Task ${item.taskId} timed out after ${this.taskTimeoutMs}ms.`);
        console.error(`TaskQueue: ${timeoutError.message}`);
        reject(timeoutError);
      }, this.taskTimeoutMs);

      item.task()
        .then(resolve)
        .catch(reject);
    });

    (async () => {
      try {
        const result = await taskPromise;
        item.resolve(result);
      } catch (err) {
        tasksFailedCounter.inc();
        console.error(`TaskQueue: Task ${item.taskId} failed:`, err.message, err.stack);
        item.reject(err);
      } finally {
        clearTimeout(timeoutId);
        this.activeCount--;
        tasksActiveGauge.dec();

        const endTime = process.hrtime.bigint();
        const durationSeconds = Number(endTime - item.startTime) / 1_000_000_000;
        taskDurationHistogram.observe(durationSeconds);

        this._processQueue();
      }
    })();
  }

  async drain() {
    if (this.isDraining) {
      console.warn('TaskQueue: Drain already initiated. Waiting for existing drain to complete.');
      if (this.drainPromises.length > 0) {
        return Promise.all(this.drainPromises);
      }
      return Promise.resolve();
    }

    this.isDraining = true;
    console.log(`TaskQueue: Initiating drain. Queued: ${this.queue.length}, Active: ${this.activeCount}.`);

    if (this.activeCount === 0 && this.queue.length === 0) {
      console.log('TaskQueue: Queue is empty, draining complete immediately.');
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.drainPromises.push(resolve);
      this._processQueue();
    });
  }

  getQueuedCount() {
    return this.queue.length;
  }

  getActiveCount() {
    return this.activeCount;
  }
}

module.exports = TaskQueue;
module.exports.tasksQueuedGauge = tasksQueuedGauge;
module.exports.tasksActiveGauge = tasksActiveGauge;
module.exports.taskDurationHistogram = taskDurationHistogram;
module.exports.tasksFailedCounter = tasksFailedCounter;
module.exports.tasksTimedOutCounter = tasksTimedOutCounter;
