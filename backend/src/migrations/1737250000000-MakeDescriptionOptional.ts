import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeDescriptionOptional1737250000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "description" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "description" SET NOT NULL
    `);
  }
}
