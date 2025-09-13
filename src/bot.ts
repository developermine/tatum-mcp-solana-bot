import { config } from './config/config';
import { TokenDetector } from './lib/services/tokenDetector';
import { logger } from './lib/utils/logger';

async function main() {
  logger.info('Starting Meteora token detection bot...');
  const detector = new TokenDetector();

  while (true) {
    try {
      const token = await detector.pollNewTokens();
      if (token) {
        logger.info('Token data', token);
      }
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    } catch (error) {
      logger.error('Polling error:', { error });
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
}

main().catch((error) => {
  logger.error('Fatal error:', { error });
  process.exit(1);
});