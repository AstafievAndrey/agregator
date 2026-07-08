import prisma from "@/app/prisma";
import { seedTelegramSources } from "./seeds/telegram-sources.seed";

await seedTelegramSources();

await prisma.$disconnect();

console.log("Seed completed");
