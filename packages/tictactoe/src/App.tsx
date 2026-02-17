import { Application } from "@pixi/react";
import { DatabaseProvider } from "@adobe/data-react";
import { RuneDevBridgeReact } from "@paralleldrive/rune/react";
import { agentPlugin } from "./plugins/agent-plugin.js";
import { useDatabase } from "./hooks/use-database.js";
import { TicTacToeStage } from "./tictactoe-stage.js";
import { TicTacToeHud } from "./tictactoe-hud.js";

const RuneBridge = () => {
  const db = useDatabase();
  return (
    <RuneDevBridgeReact
      service={db.services.agent}
      showStatus
      hmrClient={import.meta.hot}
    />
  );
};

export const App = () => {
  return (
    <DatabaseProvider plugin={agentPlugin}>
      <TicTacToeHud />
      <Application width={640} height={440} background={0x101828}>
        <TicTacToeStage />
      </Application>
      <RuneBridge />
    </DatabaseProvider>
  );
};
