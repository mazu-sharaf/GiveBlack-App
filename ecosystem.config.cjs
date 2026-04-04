module.exports = {
  apps: [{
    name: "giveblack-api",
    script: "apps/api/dist/index.js",
    cwd: "/var/www/giveblack",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    watch: false,
    max_memory_restart: "512M",
    env: {
      NODE_ENV: "production",
      PORT: 5001,
    },
  }],
};
