import { Schema } from "@adobe/data/schema";

export const schema = {
  type: "string",
  description: "Tic-Tac-Toe board encoded as 9 characters using X, O, or space from left to right, top to bottom.",
  minLength: 9,
  maxLength: 9
} as const satisfies Schema;
