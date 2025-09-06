module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'started server on',
      url: ['http://localhost:3000'],
      numberOfRuns: 1
    },
    upload: {
      target: 'filesystem',
      outputPath: './lhci-report'
    }
  }
};
