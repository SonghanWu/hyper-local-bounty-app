import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1735000000000 implements MigrationInterface {
  name = 'InitialSchema1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" character varying UNIQUE,
        "phone" character varying UNIQUE,
        "password" character varying NOT NULL,
        "name" character varying NOT NULL,
        "avatar" character varying,
        "rating" NUMERIC(3,2) DEFAULT 0 NOT NULL,
        "lastLatitude" NUMERIC(10,8),
        "lastLongitude" NUMERIC(11,8),
        "lastLocationUpdatedAt" TIMESTAMP,
        "backgroundLocationEnabled" boolean DEFAULT false NOT NULL,
        "pushNotificationsEnabled" boolean DEFAULT true NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'orders_status_enum') THEN
          CREATE TYPE "orders_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'COMPLETED', 'CANCELLED');
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "rewardAmount" NUMERIC(10,2) NOT NULL,
        "status" "orders_status_enum" DEFAULT 'PENDING' NOT NULL,
        "latitude" NUMERIC(10,8) NOT NULL,
        "longitude" NUMERIC(11,8) NOT NULL,
        "requesterId" uuid NOT NULL,
        "helperId" uuid,
        "acceptedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_orders_requester" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_helper" FOREIGN KEY ("helperId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_requesterId" ON "orders" ("requesterId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_status" ON "orders" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
