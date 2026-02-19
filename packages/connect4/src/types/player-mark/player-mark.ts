import { Schema } from "@adobe/data/schema";
import { schema } from "./player-mark-schema.js";

export type PlayerMark = Schema.ToType<typeof schema>;
export * as PlayerMark from "./public.js";
