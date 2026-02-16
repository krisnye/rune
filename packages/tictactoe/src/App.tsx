import { Application } from "@pixi/react";
import { useState } from "react";
import { DatabaseProvider } from "@adobe/data-react";
import { runeServerPlugin } from "./plugins/rune-server-plugin.js";
import { TicTacToeStage } from "./tictactoe-stage.js";
import { TicTacToeHud } from "./tictactoe-hud.js";
import { RuneDevBridgeHost } from "./rune-dev-bridge/rune-dev-bridge-host.js";
import { type RuneDevBridgeStatus } from "./rune-dev-bridge/create-browser-host.js";

export const App = () => {
  const [bridgeStatus, setBridgeStatus] = useState<RuneDevBridgeStatus | undefined>(undefined);

  return (
    <DatabaseProvider plugin={runeServerPlugin}>
      <RuneDevBridgeHost onStatusChange={setBridgeStatus} />
      <TicTacToeHud bridgeStatus={bridgeStatus} />
      <Application width={640} height={440} background={0x101828}>
        <TicTacToeStage />
      </Application>
    </DatabaseProvider>
  );
};
