import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpoPushToken1735948800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "expoPushToken" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "expoPushToken"
    `);
  }
}
