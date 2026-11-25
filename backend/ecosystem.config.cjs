module.exports = {
  apps: [
    {
      name: 'rehman-perfume-api',
      script: 'src/server.js',
      // 'max' forks a worker process for every CPU core available on the host machine.
      // This eliminates the single-thread event loop freeze under high concurrent traffic.
      instances: process.env.WEB_CONCURRENCY || 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'development',
        PORT: 8000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000,
      },
    },
  ],
}

