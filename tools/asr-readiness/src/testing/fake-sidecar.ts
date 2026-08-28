/**
 * A real (not mocked-fetch) HTTP fake of whisper-server's `/inference`,
 * for exercising `verify-asr`'s actual multipart POST + fetch machinery
 * end-to-end. NOT integration evidence for the real ASR sidecar — see
 * verify-asr.ts's header comment.
 */
import { createServer, type Server } from "node:http";

export interface FakeSidecar {
  readonly url: string;
  close(): Promise<void>;
}

export async function startFakeSidecar(responseText: string, status = 200): Promise<FakeSidecar> {
  const server: Server = createServer((req, res) => {
    if (req.url === "/inference" && req.method === "POST") {
      req.resume();
      req.on("end", () => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ text: responseText }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("no server address");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
