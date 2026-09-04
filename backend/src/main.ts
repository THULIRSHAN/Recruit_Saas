import path from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  // One root .env is shared by docker-compose and the backend (see M1.4).
  // Inside docker compose the variables are already in process.env, so this
  // is a harmless no-op there; it only matters for native (non-Docker) runs.
  config({ path: path.resolve(process.cwd(), '../.env'), quiet: true });

  const app = await NestFactory.create(AppModule);
  // docs/api.md §1: every API endpoint is versioned from day one. `health`
  // is excluded -- it's an infra-level check (Docker healthcheck, load
  // balancer probes), not a versioned API resource, and should stay at a
  // stable path across API versions.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(cookieParser());
  // whitelist: strip unknown properties instead of erroring, so DTOs are the
  // single source of truth for accepted fields (CLAUDE.md rule 5).
  // forbidNonWhitelisted: reject requests carrying fields no DTO declares,
  // rather than silently dropping them -- surfaces client bugs immediately.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const port = process.env.BACKEND_PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
