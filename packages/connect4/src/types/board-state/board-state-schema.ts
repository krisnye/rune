import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  description:
    "Connect 4 board encoded as 42 characters (6 rows × 7 columns), row-major, using Y, R, or space.",
  minLength: 42,
  maxLength: 42,
} as const satisfies Schema;
