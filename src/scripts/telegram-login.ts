import { loginTelegram } from "@/modules/telegram/collector/telegram.auth";

const session = await loginTelegram();

console.log("\nTELEGRAM_SESSION:");
console.log(session);
