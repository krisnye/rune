# Rune

Rune is an MCP style server to enable AI agents to discover and interact with an ECS based application.

The protocol will use Jiron: https://github.com/paralleldrive/jiron

Jiron uses pug like syntax extended with semantic actions which map to restful endpoints.

We will host an http server which when the default page is GET will return a jiron document with the current state and the available commands.

When a command is executed over http then the response will include the new state.

The server will built as a Database.Plugin extension to an ECS Database https://github.com/adobe/data/blob/main/packages/data/src/ecs/database/database.ts

