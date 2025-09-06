const pino = require('pino');
const requestContext = require('./requestContext');

const IS_PRODUCTION_ENV = process.env.NODE_ENV === 'production';
const IS_DEVELOPMENT_ENV = process.env.NODE_ENV === 'development';

const logger = pino({
  level: IS_PRODUCTION_ENV ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    log: (obj) => {
      if (obj instanceof Error) {
        return { message: obj.message, stack: obj.stack, ...obj };
      }
      return obj;
    },
  },
  mixin() {
    const correlationId = requestContext.get('correlationId');
    return correlationId ? { correlationId } : {};
  },
  transport: IS_DEVELOPMENT_ENV ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

module.exports = logger;
