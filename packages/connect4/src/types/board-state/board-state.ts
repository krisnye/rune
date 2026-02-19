import { Schema } from "@adobe/data/schema";
import { schema } from "./board-state-schema.js";

export type BoardState = Schema.ToType<typeof schema>;
export * as BoardState from "./public.js";
