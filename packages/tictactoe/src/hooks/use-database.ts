import { useDatabase as useDatabaseHook } from "@adobe/data-react";
import { runeServerPlugin } from "../plugins/rune-server-plugin.js";

type UseDatabaseResult = ReturnType<typeof useDatabaseHook<typeof runeServerPlugin>>;

export const useDatabase = (): UseDatabaseResult => useDatabaseHook(runeServerPlugin);
