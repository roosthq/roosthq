import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Default body limit is too small for an uploaded-image data URI (base64'd prize
  // photos) — bump it. bodyParser: false so these replace Nest's defaults instead
  // of fighting them.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());
  // All routes are served under /api so a single reverse proxy (Caddy behind the
  // Cloudflare Tunnel) can route /api -> this server and / -> the frontend, keeping
  // cookies first-party.
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Roost HQ API listening on http://localhost:${port}`);
}

bootstrap();
