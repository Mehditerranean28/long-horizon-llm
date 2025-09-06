module.exports = {
  apps: [
    {
      name: 'son-of-anton',
      script: './server/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false
    }
  ]
};
