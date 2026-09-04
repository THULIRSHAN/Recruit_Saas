import path from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // One root .env is shared by docker-compose and the backend (see M1.4).
  // Inside docker compose the variables are already in process.env, so this
  // is a harmless no-op there; it only matters for native (non-Docker) runs.
  config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });

  const app = await NestFactory.create(AppModule);
  const port = process.env.BACKEND_PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
