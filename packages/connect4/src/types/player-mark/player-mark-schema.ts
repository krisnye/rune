import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  enum: ["Y", "R"],
  description: "Connect 4 player mark (yellow or red)",
} as const satisfies Schema;
