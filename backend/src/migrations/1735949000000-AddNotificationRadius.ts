import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationRadius1735949000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "notificationRadius" integer DEFAULT 2000
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "notificationRadius"
    `);
  }
}
