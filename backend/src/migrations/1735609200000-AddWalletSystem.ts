import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletSystem1735609200000 implements MigrationInterface {
  name = 'AddWalletSystem1735609200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add balance column to users table
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "balance" NUMERIC(10,2) DEFAULT 100 NOT NULL
    `);

    // Create transactions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transactions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "fromUserId" uuid,
        "toUserId" uuid,
        "amount" NUMERIC(10,2) NOT NULL,
        "type" character varying NOT NULL DEFAULT 'TRANSFER',
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "orderId" uuid,
        "description" text,
        "failureReason" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_transactions_fromUser" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_toUser" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_transactions_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // Create index on fromUserId and toUserId for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_fromUserId" ON "transactions" ("fromUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_toUserId" ON "transactions" ("toUserId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_orderId" ON "transactions" ("orderId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop transactions table
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);

    // Remove balance column from users table
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "balance"`);
  }
}
