const { API_BASE_URL } = require('./api-base.js');

async function post(endpoint, payload) {
  const url = `${API_BASE_URL}${endpoint}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore parse failures
  }

  if (!res.ok) {
    const msg = (data && data.message) || res.statusText;
    const error = new Error(msg);
    error.status = res.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function registerUser(payload) {
  return post('/register', payload);
}

async function loginUser(payload) {
  return post('/login', payload);
}

module.exports = {
  registerUser,
  loginUser,
};
