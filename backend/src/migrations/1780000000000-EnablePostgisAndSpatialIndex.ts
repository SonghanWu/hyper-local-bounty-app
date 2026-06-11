import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostgisAndSpatialIndex1780000000000
  implements MigrationInterface
{
  name = 'EnablePostgisAndSpatialIndex1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The nearby-order query (OrdersService.findNearbyOrders) and the
    // nearby-user query (NotificationsService) rely on PostGIS functions
    // (ST_MakePoint / ST_Distance / ST_DWithin) and the "geography" type.
    // The local/CI database uses the postgis/postgis Docker image, which
    // auto-installs the extension, but managed Postgres (Aurora) does not.
    // Without this, those queries fail with: type "geography" does not exist.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    // GiST index on the order's geographic point so ST_DWithin filters use an
    // index scan instead of evaluating the distance for every PENDING row.
    // The indexed expression must match the query's expression exactly.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_orders_geog"
      ON "orders"
      USING GIST ((ST_MakePoint("longitude", "latitude")::geography))
    `);

    // Same optimisation for nearby-user lookups when fanning out push
    // notifications for a newly created order.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_geog"
      ON "users"
      USING GIST ((ST_MakePoint("lastLongitude", "lastLatitude")::geography))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_geog"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_geog"`);
    // Intentionally do NOT drop the postgis extension on revert: other objects
    // may depend on it and dropping it is rarely the intent of a rollback.
  }
}
