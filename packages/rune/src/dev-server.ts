import { createServer } from "node:http";
import { createRuneServerDescriptor } from "./index.js";

const port = Number(process.env.PORT ?? 3001);

const server = createServer((_request, response) => {
  const descriptor = createRuneServerDescriptor();

  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify(
      {
        ok: true,
        descriptor
      },
      null,
      2
    )
  );
});

server.listen(port, () => {
  console.log(`@paralleldrive/rune dev server listening on http://localhost:${port}`);
});
