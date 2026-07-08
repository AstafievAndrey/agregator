import { loginTelegram } from "@/modules/telegram/telegram.auth";

const session = await loginTelegram();

console.log("\nTELEGRAM_SESSION:");
console.log(session);
