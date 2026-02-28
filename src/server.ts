import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';

const app = createApp();

async function shutdown(): Promise<never> {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
}

if (!env.isVercel) {
  const server = app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`Swift API URL (for generate): ${env.swiftApiUrl}`);
  });

  const onSignal = () => {
    server.close(() => shutdown());
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}

export default app;
