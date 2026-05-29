import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

async function ensureDatabaseExists() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [process.env.DB_DATABASE],
  );
  if (result.rows.length === 0) {
    await client.query(`CREATE DATABASE "${process.env.DB_DATABASE}"`);
    console.log(`Database "${process.env.DB_DATABASE}" created.`);
  }
  await client.end();
}

async function bootstrap() {
  await ensureDatabaseExists();
  const app = await NestFactory.create(AppModule);

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // Enable CORS for mobile app
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
  console.log(`🚀 Server is running on: http://localhost:${port}`);
  console.log(`📊 Environment: ${configService.get<string>('NODE_ENV')}`);
}

bootstrap();
