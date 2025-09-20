import { spawn, ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, readdirSync, mkdirSync } from "node:fs";
import { createServer } from "http";
import { randomUUID } from "node:crypto";
import { env } from "./env";

type ProgressState = "started" | "downloading" | "failed" | "finished";

const MAX_URL_LENGTH = 1000

const downloadsDir = env.DOWNLOADS_DIR;
mkdirSync(downloadsDir)


const videoMap: Record<
  string,
  {
    proc: ChildProcess | null;
    startTime: number;
    filePath: string;
    state: ProgressState;
  }
> = {};

// ---- Helper: Update yt-dlp synchronously ----
async function updateYtDlp() {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", ["-U"]);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp update failed with code ${code}`));
      }
    });
  });
}

// ---- Cleanup Function ----
function cleanupDownloads() {
  const files = readdirSync(downloadsDir);
  const now = Date.now();

  // Clean tracker entries older than TTL
  for (const [id, entry] of Object.entries(videoMap)) {
    const ageSec = (now - entry.startTime) / 1000;
    if (ageSec > env.VIDEO_TTL_SECONDS) {
      if (entry.proc && !entry.proc.killed) {
        console.log(`Deleting old video ${id} (running, killing process)`);
        entry.proc.kill("SIGKILL");
      } else {
        console.log(`Deleting old video ${id}`);
      }
      if (existsSync(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
      delete videoMap[id];
    }
  }

  // Delete orphan files
  for (const f of files) {
    const fullPath = `${downloadsDir}/${f}`;
    const tracked = Object.values(videoMap).some(
      (e) => e.filePath === fullPath
    );
    if (!tracked) {
      console.log(`Deleting orphan file ${f}`);
      try {
        unlinkSync(fullPath);
      } catch { }
    }
  }
}

function checkUrl(url: string) {
  return typeof url === "string" &&
    url.length < MAX_URL_LENGTH &&
    url.startsWith("http") &&
    !/\s|\n/.test(url)
}

// ---- API Server ----
async function main() {
  // Cleanup before anything
  cleanupDownloads();

  // Update yt-dlp before starting server
  await updateYtDlp();

  // Then schedule cleanup loop
  setInterval(cleanupDownloads, 1000);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);

    // ---- POST /api/download ----
    if (req.method === "POST" && url.pathname === "/api/download") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { url } = JSON.parse(body);

      // Validate URL
      if (!checkUrl(url)) {
        res.writeHead(400);
        res.end("invalid url");
        return;
      }

      try {
        // Ensure yt-dlp is updated before download
        await updateYtDlp();
      } catch (err) {
        res.writeHead(500);
        res.end("yt-dlp update failed");
        return;
      }

      const id = randomUUID();
      const filePath = `${downloadsDir}/${id}.mp4`;

      const args = [
        "-f",
        "mp4",
        "--max-filesize",
        env.MAX_FILESIZE,
        "-o",
        filePath,
        url,
      ];

      console.log(`New download starting: ${id}`);

      const proc = spawn("yt-dlp", args);
      videoMap[id] = {
        proc,
        startTime: Date.now(),
        filePath,
        state: "started",
      };

      proc.stderr.on("data", () => {
        if (videoMap[id].state === "started") {
          videoMap[id].state = "downloading";
        }
      });

      proc.on("exit", (code) => {
        if (code === 0) {
          videoMap[id].state = "finished";
          console.log(`New download finished: ${id}`);
        } else {
          videoMap[id].state = "failed";
          console.log(`Download failed for ${id} with code ${code}`);
        }
        videoMap[id].proc = null;
      });

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ download_id: id }));
      return;
    }

    // ---- GET /api/progress/:id ----
    if (req.method === "GET" && url.pathname.startsWith("/api/progress/")) {
      const id = req.url!.slice("/api/progress/".length);
      const entry = videoMap[id];
      if (!entry) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id, state: entry.state }));
      return;
    }

    // ---- GET /api/download/:id ----
    if (req.method === "GET" && url.pathname.startsWith("/api/download/")) {
      const id = req.url!.slice("/api/download/".length);
      const entry = videoMap[id];



      if (!entry) {
        res.writeHead(404);
        res.end("not found");
        return;
      }


      if (entry.state !== "finished") {
        switch (entry.state) {
          case "started":
          case "downloading":
            res.writeHead(202, { "Content-Type": "application/json" });
            break;
          case "failed":
          default:
            res.writeHead(409, { "Content-Type": "application/json" });
            break;
        }
        res.end(JSON.stringify({ status: entry.state }));
        return;
      }



      if (!existsSync(entry.filePath)) {
        res.writeHead(404);
        res.end("file not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${id}.mp4"`,
      });
      Bun.file(entry.filePath).stream().pipe(res);
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(env.PORT, env.BIND_ADDR, () => {
    console.log(`Server running on http://${env.BIND_ADDR}:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
