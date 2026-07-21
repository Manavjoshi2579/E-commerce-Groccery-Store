module.exports = {
  apps: [
    {
      name: "eagle-mart-backend",
      cwd: "./backend",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "app/server.ts",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      time: true,
    },
    {
      name: "eagle-mart-frontend",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      instances: 2,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      time: true,
    },
  ],
};
