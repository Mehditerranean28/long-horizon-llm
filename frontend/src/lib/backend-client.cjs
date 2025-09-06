const { API_BASE_URL } = require("./api-base.js");

const { registerUser, loginUser } = require('./auth-common.js');

module.exports = { API_BASE_URL, registerUser, loginUser };
