import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessages1737300000000 implements MigrationInterface {
  name = 'CreateChatMessages1737300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create chat_messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "orderId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "message" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_chat_messages_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_chat_messages_sender" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // Create indexes for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_orderId" ON "chat_messages" ("orderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_senderId" ON "chat_messages" ("senderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_createdAt" ON "chat_messages" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop chat_messages table
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
  }
}
