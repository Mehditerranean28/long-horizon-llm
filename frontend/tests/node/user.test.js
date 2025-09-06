// user.integration.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../../server/models/user");
const { registerUser, loginUser } = require("../../src/lib/backend-client.cjs"); // Assuming client is at this path
const { connect, disconnect } = require("./helpers/memory-db"); // Assuming memory-db is correctly configured
const fetchMock = require("./helpers/fetch-mock"); // Assuming fetch-mock is set up

// --- Global Test Setup and Teardown ---

// Before all tests, connect to the in-memory MongoDB and install the fetch mock.
// This ensures a clean and isolated environment for the entire test suite.
test.before(async () => {
  // Set a test-specific API base URL. This is crucial for environments
  // where the backend client might try to hit a real API without this override.
  process.env.TEST_API_BASE_URL = 'http://localhost:3000'; // Or any mock URL
  console.log(`Test: Setting API Base URL to ${process.env.TEST_API_BASE_URL}`);

  await connect(); // Connect to the in-memory MongoDB instance
  fetchMock.install(); // Globally mock the fetch API
  console.log('Test: Global setup complete - DB connected, fetch mocked.');
});

// After all tests, disconnect from the in-memory MongoDB and restore the fetch API.
// This cleans up resources and prevents test pollution.
test.after(async () => {
  await disconnect(); // Disconnect from the in-memory MongoDB
  fetchMock.restore(); // Restore original fetch API
  console.log('Test: Global teardown complete - DB disconnected, fetch restored.');
});

// Before each test, clear the User collection and reset the fetch mock.
// This ensures strict test isolation between individual test cases.
test.beforeEach(async () => {
  await User.deleteMany({}); // Clear all users from the database
  fetchMock.reset(); // Reset call history and mock responses for fetch
  console.log('Test: Per-test setup complete - User collection cleared, fetch mock reset.');
});

/**
 * Generates unique user data for testing.
 * @param {object} overrides - Optional properties to override default generated values.
 * @returns {object} An object containing unique username, email, and a default password.
 */
function createUserData(overrides = {}) {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return {
    username: `user_${timestamp}_${randomSuffix}`,
    email: `email_${timestamp}_${randomSuffix}@example.com`,
    password: "securepassword123!", // Use a slightly more complex default password
    ...overrides,
  };
}

// --- Mongoose Connection Test ---

test("Mongoose is connected via in-memory server with readyState 1", async () => {
  assert.equal(
    mongoose.connection.readyState,
    1,
    "Mongoose should be connected with readyState 1 (connected)",
  );
  assert.ok(mongoose.connection.db, "Mongoose connection should have a database instance");
});

// --- User Model Tests ---

test("User password is securely hashed before saving to database (bcrypt)", async () => {
  const rawPassword = "verysecurepassword";
  const userData = createUserData({ password: rawPassword });
  const user = new User(userData);
  await user.save();

  // Assert that the password is not stored in plain text.
  assert.notEqual(user.password, rawPassword, "Hashed password should not be equal to raw password");

  // Assert that the hash starts with '$2b$' or '$2a$', indicating a bcrypt hash version.
  // '$2b$' is the current standard for bcrypt.
  assert.ok(
    user.password.startsWith("$2b$") || user.password.startsWith("$2a$"),
    "Hashed password should start with '$2b$' or '$2a$' (bcrypt format)",
  );
  assert.equal(user.password.length, 60, "Bcrypt hash length should typically be 60 characters"); // Specific bcrypt hash length
});

test("User model requires username, email, and password fields", async () => {
  // Test missing username
  await assert.rejects(
    User.create({ email: "e@test.com", password: "p" }),
    (err) => {
      // Asserting against a specific Mongoose validation error message structure
      assert.ok(err.message.includes("validation failed"), "Error message should indicate validation failure");
      assert.ok(err.message.includes("Path `username` is required."), "Error message should specifically mention missing username");
      assert.equal(err.name, 'ValidationError', "Error should be a Mongoose ValidationError");
      return true;
    },
    "Should reject if username is missing",
  );

  // Test missing email
  await assert.rejects(
    User.create({ username: "u", password: "p" }),
    (err) => {
      assert.ok(err.message.includes("Path `email` is required."), "Error message should specifically mention missing email");
      return true;
    },
    "Should reject if email is missing",
  );

  // Test missing password
  await assert.rejects(
    User.create({ username: "u", email: "e@test.com" }),
    (err) => {
      assert.ok(err.message.includes("Path `password` is required."), "Error message should specifically mention missing password");
      return true;
    },
    "Should reject if password is missing",
  );
});

test("User model enforces unique username and email constraints", async () => {
  const existingUserData = createUserData();
  await User.create(existingUserData); // Create a user with unique data

  // Attempt to create a user with a duplicate username
  const duplicateUsernameData = createUserData({ username: existingUserData.username });
  await assert.rejects(
    User.create(duplicateUsernameData),
    (err) => {
      assert.equal(err.code, 11000, "Duplicate key error code should be 11000"); // MongoDB duplicate key error code
      assert.ok(err.message.includes("dup key"), "Error message should indicate duplicate key");
      assert.ok(err.message.includes("username"), "Error message should mention username field");
      return true;
    },
    "Should reject creating user with duplicate username",
  );

  // Attempt to create a user with a duplicate email
  const duplicateEmailData = createUserData({ email: existingUserData.email });
  await assert.rejects(
    User.create(duplicateEmailData),
    (err) => {
      assert.equal(err.code, 11000, "Duplicate key error code should be 11000");
      assert.ok(err.message.includes("dup key"), "Error message should indicate duplicate key");
      assert.ok(err.message.includes("email"), "Error message should mention email field");
      return true;
    },
    "Should reject creating user with duplicate email",
  );
});

test("User.comparePassword matches hashed password correctly (Promise-based)", async () => {
  const rawPassword = "supersecretpassword";
  const user = await User.create(createUserData({ password: rawPassword }));

  const match = await new Promise((resolve, reject) => {
    user.comparePassword(rawPassword, (err, isMatch) => {
      if (err) return reject(err);
      resolve(isMatch);
    });
  });
  assert.equal(match, true, "comparePassword should return true for a correct password");

  const mismatch = await new Promise((resolve, reject) => {
    user.comparePassword("wrongpassword", (err, isMatch) => {
      if (err) return reject(err);
      resolve(isMatch);
    });
  });
  assert.equal(mismatch, false, "comparePassword should return false for an incorrect password");
});


test("User.isPremium reflects subscription status and expiry accurately", async () => {
  // Premium and active
  const premiumUser = await User.create(createUserData({
    subscriptionStatus: "premium",
    subscriptionValidUntil: new Date(Date.now() + 60000), // Valid for 1 minute from now
  }));
  assert.equal(premiumUser.isPremium(), true, "User with active premium subscription should be premium");

  // Premium but expired
  const expiredPremiumUser = await User.create(createUserData({
    subscriptionStatus: "premium",
    subscriptionValidUntil: new Date(Date.now() - 60000), // Expired 1 minute ago
  }));
  assert.equal(expiredPremiumUser.isPremium(), false, "User with expired premium subscription should not be premium");

  // Free user
  const freeUser = await User.create(createUserData({
    subscriptionStatus: "free",
    subscriptionValidUntil: null, // Explicitly null for free user
  }));
  assert.equal(freeUser.isPremium(), false, "Free user should not be premium");

  // Free user with a past expiry date (should still be false as status is 'free')
  const freeUserPastExpiry = await User.create(createUserData({
    subscriptionStatus: "free",
    subscriptionValidUntil: new Date(Date.now() - 120000), // Past date
  }));
  assert.equal(freeUserPastExpiry.isPremium(), false, "Free user with past expiry should not be premium");

  // Premium user exactly at expiry (should typically be false or handled as expired)
  const exactlyExpiredUser = await User.create(createUserData({
    subscriptionStatus: "premium",
    subscriptionValidUntil: new Date(Date.now()), // Exactly now
  }));
  // Depending on implementation, this might be true or false. Assert the expected behavior.
  // Assuming `isPremium` considers `now > validUntil` as false.
  assert.equal(exactlyExpiredUser.isPremium(), false, "User expiring exactly now should not be premium");
});

// --- Backend Client Tests ---

test("registerUser sends correct POST request to /register endpoint and handles response", async () => {
  const payload = { username: "testuser", password: "testpassword", email: "test@example.com" };

  // Mock a successful registration response
  fetchMock.setResponse({
    ok: true,
    status: 200,
    body: { success: true, message: "User registered successfully." },
  });

  const response = await registerUser(payload);

  // Assert the fetch call details
  const call = fetchMock.getCalls()[0];
  assert.ok(call.url.includes("/register"), "Fetch URL should include /register endpoint");
  assert.equal(call.opts.method, "POST", "Fetch method should be POST");
  assert.equal(call.opts.headers["Content-Type"], "application/json", "Content-Type header should be application/json");
  assert.equal(call.opts.body, JSON.stringify(payload), "Request body should match payload");

  // Assert the resolved response from registerUser
  assert.deepEqual(response, { success: true, message: "User registered successfully." }, "registerUser should resolve with the expected successful response");
});

test("registerUser resolves on successful registration with default mock response", async () => {
  // fetchMock defaults to ok: true, status: 200, empty body.
  // Ensure your backend-client can handle this default or set a more specific mock if needed.
  fetchMock.setResponse({
    ok: true,
    status: 200,
    body: { success: true, userId: "mockUserId123" },
  });
  await assert.doesNotReject(
    registerUser(createUserData()),
    "registerUser should not reject on a successful API response",
  );
});

test("registerUser rejects on API error response (e.g., conflict 409)", async () => {
  const errorMessage = "User with this email already exists.";
  fetchMock.setResponse({
    ok: false,
    status: 409, // Conflict status
    body: { message: errorMessage, code: "USER_EXISTS" },
  });
  await assert.rejects(
    registerUser(createUserData()),
    (err) => {
      assert.ok(err instanceof Error, "Error should be an instance of Error");
      assert.ok(err.message.includes(errorMessage), `Error message should contain "${errorMessage}"`);
      return true;
    },
    "registerUser should reject with error message from API response",
  );
});

test("registerUser rejects on network failure or unreachable API", async () => {
  const networkError = new TypeError("Failed to fetch"); // Common fetch network error
  fetchMock.setResponse({ error: networkError });
  await assert.rejects(
    registerUser(createUserData()),
    (err) => {
      assert.ok(err instanceof Error, "Error should be an instance of Error");
      assert.ok(err.message.includes(networkError.message), `Error message should contain "${networkError.message}"`);
      return true;
    },
    "registerUser should reject on network errors",
  );
});

test("loginUser sends correct POST request to /login endpoint and returns success", async () => {
  const credentials = { username: "loginuser", password: "loginpassword" };

  fetchMock.setResponse({
    ok: true,
    status: 200,
    body: { success: true, token: "mockToken123", subscriptionStatus: "premium" },
  });

  const response = await loginUser(credentials);

  const call = fetchMock.getCalls()[0];
  assert.ok(call.url.includes("/login"), "Fetch URL should include /login endpoint");
  assert.equal(call.opts.method, "POST", "Fetch method should be POST");
  assert.equal(call.opts.headers["Content-Type"], "application/json", "Content-Type header should be application/json");
  assert.equal(call.opts.body, JSON.stringify(credentials), "Request body should match credentials");

  assert.deepEqual(
    response,
    { success: true, token: "mockToken123", subscriptionStatus: "premium" },
    "loginUser should resolve with the expected login response",
  );
});

test("loginUser rejects on authentication error (e.g., 401 Unauthorized)", async () => {
  const errorMessage = "Invalid credentials.";
  fetchMock.setResponse({
    ok: false,
    status: 401, // Unauthorized status
    body: { message: errorMessage, code: "AUTH_FAILED" },
  });
  await assert.rejects(
    loginUser({ username: "wrong", password: "wrong" }),
    (err) => {
      assert.ok(err.message.includes(errorMessage), `Error message should contain "${errorMessage}"`);
      return true;
    },
    "loginUser should reject on authentication failure",
  );
});

test("loginUser rejects on generic server error (e.g., 500 Internal Server Error)", async () => {
  const errorMessage = "Something went wrong on the server.";
  fetchMock.setResponse({
    ok: false,
    status: 500, // Internal Server Error status
    body: { message: errorMessage, debugInfo: "stack trace here" },
  });
  await assert.rejects(
    loginUser({ username: "any", password: "any" }),
    (err) => {
      assert.ok(err.message.includes(errorMessage), `Error message should contain "${errorMessage}"`);
      return true;
    },
    "loginUser should reject on generic server error",
  );
});
