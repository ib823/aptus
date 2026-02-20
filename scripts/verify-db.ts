import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Test connection
    await prisma.$connect();
    console.log("Database connection: OK");

    // Count tables by running a simple query on each model
    const tables = await prisma.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;

    console.log(`Database ready: ${tables.length} tables created`);

    for (const table of tables) {
      console.log(`  - ${table.tablename}`);
    }
  } catch (error) {
    console.error("Database verification failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
