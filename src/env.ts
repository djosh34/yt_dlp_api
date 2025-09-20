import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import process from "node:process"; 

export const env = createEnv({
  server: {
    DOWNLOADS_DIR: z.string().default("./downloads"),
    MAX_FILESIZE: z.string().default("50M"),
    VIDEO_TTL_SECONDS: z.number().default(300),
    PORT: z.number().default(3000),
    BIND_ADDR: z.string().default("0.0.0.0"),
  },
  clientPrefix: "PUBLIC_",
  client: {},
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
