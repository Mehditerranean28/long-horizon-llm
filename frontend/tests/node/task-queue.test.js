// task-queue.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const TaskQueue = require('../../server/utils/taskQueue');
const { metricsRegistry } = require('../../server/utils/metrics');
const metricsAvailable = !!metricsRegistry;

// Before each task queue test, ensure Prometheus metrics are reset for isolation.
test.beforeEach(async () => {
  // It's good practice to reset the entire registry if tests might affect
  // metrics from other modules, but for specific gauges/counters on TaskQueue,
  // resetting them individually is more precise.
  TaskQueue.tasksQueuedGauge.reset();
  TaskQueue.tasksActiveGauge.reset();
  TaskQueue.taskDurationHistogram.reset();
  TaskQueue.tasksFailedCounter.reset();
  TaskQueue.tasksTimedOutCounter.reset();

  // If you want to ensure all metrics across your application are reset,
  // you might do: metricsRegistry.clear();
  // However, `prom-client` typically manages state per gauge/counter.
});

test('TaskQueue enforces concurrency ordering (concurrency 1)', async () => {
  const queue = new TaskQueue(1); // Concurrency of 1 to strictly test serial execution
  const order = [];

  const p1 = queue.add(async () => {
    order.push('task_a');
    await new Promise(r => setTimeout(r, 20)); // Simulate async work for task 'a'
    return 'result_a';
  });

  const p2 = queue.add(async () => {
    order.push('task_b');
    await new Promise(r => setTimeout(r, 10)); // Simulate async work for task 'b'
    return 'result_b';
  });

  const p3 = queue.add(async () => {
    order.push('task_c');
    return 'result_c';
  });

  await Promise.all([p1, p2, p3]);

  // Assert that tasks were executed in the order they were added.
  assert.deepEqual(order, ['task_a', 'task_b', 'task_c'], "Tasks should execute strictly in order when concurrency is 1");
});

test('TaskQueue enforces concurrency limit (concurrency > 1)', async () => {
  const concurrency = 2;
  const queue = new TaskQueue(concurrency);
  const activeTasks = new Set();
  let maxActiveObserved = 0;

  const createTestTask = (id, delay) => async () => {
    activeTasks.add(id);
    maxActiveObserved = Math.max(maxActiveObserved, activeTasks.size);
    await new Promise(r => setTimeout(r, delay));
    activeTasks.delete(id);
    return `task_${id}_done`;
  };

  const tasks = [];
  tasks.push(queue.add(createTestTask('1', 50))); // Should start immediately
  tasks.push(queue.add(createTestTask('2', 60))); // Should start immediately
  tasks.push(queue.add(createTestTask('3', 10))); // Should be queued, then start after task 1 or 2 finishes
  tasks.push(queue.add(createTestTask('4', 5)));  // Should be queued

  // Give a very small moment for tasks to start
  await new Promise(r => setTimeout(r, 10));

  // Assert initial active count (before any finish)
  assert.equal(queue.getActiveCount(), concurrency, "Active count should reach concurrency limit immediately");
  assert.equal(maxActiveObserved, concurrency, "Max active observed should be at concurrency limit");
  assert.equal(queue.getQueuedCount(), 2, "Two tasks should be queued initially");

  await Promise.all(tasks);

  assert.equal(maxActiveObserved, concurrency, "Max active tasks should not exceed concurrency limit throughout execution");
  assert.equal(queue.getQueuedCount(), 0, "After all tasks complete, queue should be empty");
  assert.equal(queue.getActiveCount(), 0, "After all tasks complete, active count should be 0");
});


test('TaskQueue updates all Prometheus metrics correctly for successful tasks', async () => {
  if (!metricsAvailable) {
    test.skip('Prometheus metrics disabled');
    return;
  }
  // All metrics are reset in test.beforeEach, ensuring a clean slate.

  const queue = new TaskQueue(2); // Concurrency of 2

  const startTime = process.hrtime.bigint(); // Capture approximate start time for duration check
  const p1 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 50));
    return 'task1_result';
  });
  const p2 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 100));
    return 'task2_result';
  });
  const p3 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 20));
    return 'task3_result';
  });

  // Verify gauges immediately after adding (some active, some queued)
  assert.equal((await TaskQueue.tasksQueuedGauge.get()).values[0]?.value, 1, "Queued gauge should show 1 initially");
  assert.equal((await TaskQueue.tasksActiveGauge.get()).values[0]?.value, 2, "Active gauge should show 2 initially");
  
  await Promise.all([p1, p2, p3]);
  const endTime = process.hrtime.bigint();

  // Verify gauges after all tasks complete
  assert.equal((await TaskQueue.tasksQueuedGauge.get()).values[0]?.value, 0, "Queued gauge should be 0 after completion");
  assert.equal((await TaskQueue.tasksActiveGauge.get()).values[0]?.value, 0, "Active gauge should be 0 after completion");

  // Verify success-related metrics
  const histogramMetrics = await TaskQueue.taskDurationHistogram.get();
  assert.ok(histogramMetrics.values.length > 0, "Task duration histogram should have recorded values");
  assert.equal(histogramMetrics.values.find(v => v.metricName.includes('_count')).value, 3, "Histogram count should be 3 for three completed tasks");

  // Verify that tasks were indeed run for a measurable duration
  const totalObservedDuration = histogramMetrics.values.find(v => v.metricName.includes('_sum')).value;
  // Sum of durations should be roughly at least the sum of delays, and less than total test run time
  assert.ok(totalObservedDuration >= 0.05 + 0.10 + 0.02, "Total observed duration should be sum of task delays (approx)");
  assert.ok(totalObservedDuration <= Number(endTime - startTime) / 1_000_000_000, "Total observed duration should be less than total test run time");

  // Verify failure/timeout counters are 0 for successful runs
  assert.equal((await TaskQueue.tasksFailedCounter.get()).values[0]?.value, 0, "Failed tasks counter should be 0");
  assert.equal((await TaskQueue.tasksTimedOutCounter.get()).values[0]?.value, 0, "Timed out tasks counter should be 0");
});

test('TaskQueue handles task failures and updates failure metrics accurately', async () => {
  if (!metricsAvailable) {
    test.skip('Prometheus metrics disabled');
    return;
  }
  // All metrics are reset in test.beforeEach.

  const queue = new TaskQueue(1);
  const errorMessage = 'Explicit task failure via throw';

  const failedTaskPromise = queue.add(async () => {
    await new Promise(r => setTimeout(r, 10)); // Short delay before failing
    throw new Error(errorMessage);
  });

  // Assert that the promise rejects with the specific error.
  await assert.rejects(failedTaskPromise, (err) => {
    assert.ok(err.message.includes(errorMessage), "Promise should reject with the task's specific error message");
    return true;
  }, "Task queue should reject the promise when an added task fails");

  // Give the event loop a moment to ensure `finally` block and metric updates
  await new Promise(r => setTimeout(r, 5));

  // Verify gauges return to 0 after task processing (whether success or fail)
  assert.equal((await TaskQueue.tasksQueuedGauge.get()).values[0]?.value, 0, "Queued gauge should be 0 after failed task");
  assert.equal((await TaskQueue.tasksActiveGauge.get()).values[0]?.value, 0, "Active gauge should be 0 after failed task");

  // Verify failure counter is incremented
  assert.equal((await TaskQueue.tasksFailedCounter.get()).values[0]?.value, 1, "Failed tasks counter should be 1 after a task failure");

  // Verify timeout counter is 0
  assert.equal((await TaskQueue.tasksTimedOutCounter.get()).values[0]?.value, 0, "Timed out tasks counter should be 0 (no timeout)");
});

test('TaskQueue handles task timeouts and updates timeout metrics accurately', async () => {
  if (!metricsAvailable) {
    test.skip('Prometheus metrics disabled');
    return;
  }
  // All metrics are reset in test.beforeEach.

  const taskTimeout = 20; // Short timeout for testing
  const queue = new TaskQueue(1, { taskTimeoutMs: taskTimeout });

  const timedOutTaskPromise = queue.add(async () => {
    await new Promise(r => setTimeout(r, taskTimeout * 5)); // Task takes significantly longer than timeout
    return 'should_not_resolve_due_to_timeout';
  });

  // Assert that the promise rejects with a timeout message.
  await assert.rejects(timedOutTaskPromise, (err) => {
    assert.ok(err.message.includes('timed out'), "Promise should reject with a timeout message");
    assert.ok(err.message.includes(`after ${taskTimeout}ms`), `Timeout message should specify ${taskTimeout}ms`);
    return true;
  }, "Task queue should reject the promise when an added task times out");

  // Give the event loop a small moment to ensure `finally` block and metric updates
  await new Promise(r => setTimeout(r, taskTimeout + 10)); // Wait slightly longer than the timeout

  // Verify gauges return to 0 after task processing (whether success, fail, or timeout)
  assert.equal((await TaskQueue.tasksQueuedGauge.get()).values[0]?.value, 0, "Queued gauge should be 0 after timed out task");
  assert.equal((await TaskQueue.tasksActiveGauge.get()).values[0]?.value, 0, "Active gauge should be 0 after timed out task");

  // Verify timeout counter is incremented
  assert.equal((await TaskQueue.tasksTimedOutCounter.get()).values[0]?.value, 1, "Timed out tasks counter should be 1 after a task timeout");

  // Verify failed counter is 0
  assert.equal((await TaskQueue.tasksFailedCounter.get()).values[0]?.value, 0, "Failed tasks counter should be 0 (not a direct failure)");
});

test('TaskQueue prevents adding new tasks when in draining mode', async () => {
  const queue = new TaskQueue(1);

  // Add an initial task to ensure the queue is active when drain is called.
  const initialTask = queue.add(async () => {
    await new Promise(r => setTimeout(r, 100)); // Keep the queue busy for a moment
    return 'initial_task_done';
  });

  // Immediately initiate draining.
  const drainPromise = queue.drain();

  // Attempt to add a new task while draining.
  const rejectedAddTaskPromise = queue.add(async () => {
    return 'this_should_not_run';
  });

  await assert.rejects(
    rejectedAddTaskPromise,
    (err) => {
      assert.ok(err.message.includes('TaskQueue is draining'), "Error message should clearly indicate draining state");
      return true;
    },
    "Adding a task to a draining queue should be rejected"
  );

  // Ensure the initial task still completes and drain eventually resolves.
  await Promise.allSettled([initialTask, drainPromise]);
  assert.equal(queue.getQueuedCount(), 0, "Queue should be empty after drain completes");
  assert.equal(queue.getActiveCount(), 0, "Active tasks should be 0 after drain completes");
});

test('TaskQueue drain function waits for all active and queued tasks to complete', async () => {
  const queue = new TaskQueue(2); // Concurrency of 2

  let task1Completed = false;
  let task2Completed = false;
  let task3Completed = false;
  let task4Completed = false;

  const p1 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 80)); // Active task
    task1Completed = true;
  });
  const p2 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 120)); // Active task
    task2Completed = true;
  });
  const p3 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 50)); // Queued task (starts after p1 or p2 finishes)
    task3Completed = true;
  });
  const p4 = queue.add(async () => {
    await new Promise(r => setTimeout(r, 30)); // Queued task
    task4Completed = true;
  });

  // Call drain. It should only resolve after all 4 tasks (2 active, 2 queued) are done.
  const drainOperation = queue.drain();

  // Verify state before drain completes
  assert.equal(task1Completed, false, "Task 1 should not be completed before drain resolves");
  assert.equal(task2Completed, false, "Task 2 should not be completed before drain resolves");
  assert.equal(task3Completed, false, "Task 3 should not be completed before drain resolves");
  assert.equal(task4Completed, false, "Task 4 should not be completed before drain resolves");

  await drainOperation; // Wait for the drain to complete

  // Verify all tasks have indeed completed after the drain resolves.
  assert.equal(task1Completed, true, "Task 1 should be completed after drain resolves");
  assert.equal(task2Completed, true, "Task 2 should be completed after drain resolves");
  assert.equal(task3Completed, true, "Task 3 should be completed after drain resolves");
  assert.equal(task4Completed, true, "Task 4 should be completed after drain resolves");

  assert.equal(queue.getQueuedCount(), 0, "After drain, queued count should be 0");
  assert.equal(queue.getActiveCount(), 0, "After drain, active count should be 0");
});

test('TaskQueue drain resolves immediately if queue is empty and no active tasks', async () => {
  const queue = new TaskQueue(2);

  assert.equal(queue.getQueuedCount(), 0, "Queue should be empty initially");
  assert.equal(queue.getActiveCount(), 0, "No active tasks initially");

  const drainPromise = queue.drain();
  // Check if it's already resolved without an explicit await
  const isResolved = await Promise.race([drainPromise.then(() => true), new Promise(r => setTimeout(() => r(false), 10))]);

  assert.equal(isResolved, true, "Drain should resolve almost immediately if queue is empty");
  await drainPromise; // Await to ensure it's fully settled.
  assert.equal(queue.getQueuedCount(), 0, "Queue remains empty after immediate drain");
  assert.equal(queue.getActiveCount(), 0, "Active count remains 0 after immediate drain");
});

test('TaskQueue returns correct queued and active counts at various stages', async () => {
  const queue = new TaskQueue(2); // Concurrency of 2

  assert.equal(queue.getQueuedCount(), 0, "Initial queued count should be 0");
  assert.equal(queue.getActiveCount(), 0, "Initial active count should be 0");

  const p1 = queue.add(async () => { await new Promise(r => setTimeout(r, 100)); });
  // After adding 1st task with concurrency 2, it should immediately become active
  assert.equal(queue.getQueuedCount(), 0, "Queued count should be 0 (task 1 active)");
  assert.equal(queue.getActiveCount(), 1, "Active count should be 1 (task 1 active)");

  const p2 = queue.add(async () => { await new Promise(r => setTimeout(r, 100)); });
  // After adding 2nd task with concurrency 2, it should also become active
  assert.equal(queue.getQueuedCount(), 0, "Queued count should be 0 (tasks 1 & 2 active)");
  assert.equal(queue.getActiveCount(), 2, "Active count should be 2 (tasks 1 & 2 active)");

  const p3 = queue.add(async () => { await new Promise(r => setTimeout(r, 100)); });
  // After adding 3rd task, it exceeds concurrency and should be queued
  assert.equal(queue.getQueuedCount(), 1, "Queued count should be 1 (task 3 queued)");
  assert.equal(queue.getActiveCount(), 2, "Active count should remain 2");

  const p4 = queue.add(async () => { await new Promise(r => setTimeout(r, 50)); });
  assert.equal(queue.getQueuedCount(), 2, "Queued count should be 2 (tasks 3 & 4 queued)");
  assert.equal(queue.getActiveCount(), 2, "Active count should remain 2");

  await new Promise(r => setTimeout(r, 120)); // Wait for first batch (p1, p2) to complete

  assert.equal(queue.getQueuedCount(), 0, "Queued count should be 0 after first batch completes and remaining tasks become active");
  assert.equal(queue.getActiveCount(), 2, "Active count should be 2 after first batch completes (p3, p4 now active)");

  await Promise.all([p1, p2, p3, p4]); // Wait for all tasks to fully complete

  assert.equal(queue.getQueuedCount(), 0, "Final queued count should be 0");
  assert.equal(queue.getActiveCount(), 0, "Final active count should be 0");
});

test('TaskQueue construction handles invalid concurrency values gracefully', async () => {
  // Test zero concurrency
  assert.throws(() => {
    new TaskQueue(0);
  }, (err) => {
    assert.ok(err.message.includes('Concurrency must be a positive integer'), "Error message for 0 concurrency");
    return true;
  }, "Should throw an error for concurrency 0");

  // Test negative concurrency
  assert.throws(() => {
    new TaskQueue(-1);
  }, (err) => {
    assert.ok(err.message.includes('Concurrency must be a positive integer'), "Error message for negative concurrency");
    return true;
  }, "Should throw an error for negative concurrency");

  // Test non-integer concurrency
  assert.throws(() => {
    new TaskQueue(1.5);
  }, (err) => {
    assert.ok(err.message.includes('Concurrency must be a positive integer'), "Error message for non-integer concurrency");
    return true;
  }, "Should throw an error for non-integer concurrency");

  // Test non-numeric concurrency
  assert.throws(() => {
    new TaskQueue('invalid');
  }, (err) => {
    assert.ok(err.message.includes('Concurrency must be a positive integer'), "Error message for non-numeric concurrency");
    return true;
  }, "Should throw an error for non-numeric concurrency");

  // Test valid concurrency should not throw
  assert.doesNotThrow(() => {
    new TaskQueue(1);
    new TaskQueue(5);
  }, "Should not throw an error for valid positive integer concurrency");
});

test('TaskQueue respects maxQueueSize option', async () => {
  const maxQueueSize = 2;
  const queue = new TaskQueue(1, { maxQueueSize }); // Concurrency 1, max queue 2

  // Add first task (active)
  queue.add(async () => { await new Promise(r => setTimeout(r, 50)); });
  // Add second task (queued)
  queue.add(async () => { await new Promise(r => setTimeout(r, 50)); });
  // Add third task (queued, fills maxQueueSize)
  queue.add(async () => { await new Promise(r => setTimeout(r, 50)); });

  assert.equal(queue.getQueuedCount(), maxQueueSize, "Queue should be at max size");
  assert.equal(queue.getActiveCount(), 1, "One task should be active");

  // Attempt to add a fourth task - should be rejected
  const rejectedPromise = queue.add(async () => { return 'should_not_be_added'; });

  await assert.rejects(rejectedPromise, (err) => {
    assert.ok(err.message.includes('Queue full'), "Should reject with 'Queue full' message");
    assert.ok(err.message.includes(`max size ${maxQueueSize}`), `Message should specify max size ${maxQueueSize}`);
    return true;
  }, "Should reject adding tasks when max queue size is reached");
});

test('TaskQueue drain resolves successfully even if some tasks fail or timeout', async () => {
  if (!metricsAvailable) {
    test.skip('Prometheus metrics disabled');
    return;
  }
  TaskQueue.tasksFailedCounter.reset();
  TaskQueue.tasksTimedOutCounter.reset();

  const queue = new TaskQueue(2, { taskTimeoutMs: 20 });

  const failingTask = queue.add(async () => {
    await new Promise(r => setTimeout(r, 10));
    throw new Error('Forced failure');
  });

  const timingOutTask = queue.add(async () => {
    await new Promise(r => setTimeout(r, 100)); // Will timeout
    return 'too slow';
  });

  const successfulTask = queue.add(async () => {
    await new Promise(r => setTimeout(r, 15));
    return 'success';
  });

  const drainPromise = queue.drain();

  // We await the drain, which should wait for all tasks (even failing/timing out ones) to process.
  await drainPromise;

  // Assert that drain itself resolved successfully (didn't throw).
  assert.doesNotReject(drainPromise, "Drain should resolve even with failing/timing out tasks");

  // Assert final state of counters
  assert.equal((await TaskQueue.tasksFailedCounter.get()).values[0]?.value, 1, "Failed counter should be 1");
  assert.equal((await TaskQueue.tasksTimedOutCounter.get()).values[0]?.value, 1, "Timed out counter should be 1");
  assert.equal(queue.getQueuedCount(), 0, "Queue should be empty after drain");
  assert.equal(queue.getActiveCount(), 0, "Active tasks should be 0 after drain");

  // Ensure individual task promises are settled (rejected for failures/timeouts)
  await assert.rejects(failingTask, /Forced failure/, "Failing task promise should reject");
  await assert.rejects(timingOutTask, /timed out/, "Timing out task promise should reject");
  await assert.doesNotReject(successfulTask, "Successful task promise should resolve");
});
