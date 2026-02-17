import { Application } from "@pixi/react";
import { DatabaseProvider } from "@adobe/data-react";
import { agentPlugin } from "./plugins/agent-plugin.js";
import { TicTacToeStage } from "./tictactoe-stage.js";
import { TicTacToeHud } from "./tictactoe-hud.js";
import { RuneDevBridgeHost } from "./rune-dev-bridge/rune-dev-bridge-host.js";

export const App = () => {
  return (
    <DatabaseProvider plugin={agentPlugin}>
      <RuneDevBridgeHost />
      <TicTacToeHud />
      <Application width={640} height={440} background={0x101828}>
        <TicTacToeStage />
      </Application>
    </DatabaseProvider>
  );
};
