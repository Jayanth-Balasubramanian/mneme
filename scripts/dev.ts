const apiPort = Bun.env.API_PORT ?? Bun.env.PORT ?? "8787";
const webPort = Bun.env.WEB_PORT ?? "5173";

const childProcesses = [
  Bun.spawn(["bun", "run", "dev:api"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...Bun.env,
      API_PORT: apiPort,
      PORT: apiPort,
    },
  }),
  Bun.spawn(["bun", "run", "dev:web"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: {
      ...Bun.env,
      API_PORT: apiPort,
      WEB_PORT: webPort,
    },
  }),
];

function stopChildren(): void {
  for (const child of childProcesses) {
    child.kill();
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopChildren();
    process.exit(0);
  });
}

const firstExitCode = await Promise.race(
  childProcesses.map(async (child) => child.exited),
);

stopChildren();
process.exit(firstExitCode);

export {};
