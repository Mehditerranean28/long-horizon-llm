const User = require('./user');
const ContactMessage = require('./contactMessage');
const ClientInfo = require('./clientInfo');
const DataRequest = require('./dataRequest');
const CookiePreference = require('./cookiePreference');
let Task;
try {
  Task = require('./task');
} catch {
  // optional task model
}
module.exports = { User, Task, ContactMessage, ClientInfo, DataRequest, CookiePreference };
