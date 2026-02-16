import { Schema } from "@adobe/data/schema";

export const schema = {
  enum: ["X", "O"]
} as const satisfies Schema;
