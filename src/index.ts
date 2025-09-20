import { env } from "./env";
import { mkdir, readdir } from "node:fs/promises";


type ProgressState = "started" | "downloading" | "failed" | "finished";

const MAX_URL_LENGTH = 1000;
const YT_DLP_PATH = "/usr/local/bin/yt-dlp";

const downloadsDir = env.DOWNLOADS_DIR;
await mkdir(downloadsDir, { recursive: true });

interface VideoEntry {
  proc: ReturnType<typeof Bun.spawn> | null;
  startTime: number;
  filePath: string;
  state: ProgressState;
}

const videoMap: Record<string, VideoEntry> = {};

// ---- Helper: Update yt-dlp ----
async function updateYtDlp() {
  return new Promise<void>((resolve, reject) => {
    const proc = Bun.spawn([YT_DLP_PATH, "-U"], {
      stderr: "pipe",
      stdout: "ignore",
    });

    (async () => {
      for await (const chunk of proc.stderr) {
        const text = new TextDecoder().decode(chunk);
        console.error('YTDLP_UPDATE: ', text);
      }
    })();

    proc.exited.then((code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp update failed with code ${code}`));
      }
    });
  });
}

// ---- Cleanup Function ----
async function cleanupDownloads() {
  const now = Date.now();
  const files = await readdir(downloadsDir);

  for (const [id, entry] of Object.entries(videoMap)) {
    const ageSec = (now - entry.startTime) / 1000;
    if (ageSec > env.VIDEO_TTL_SECONDS) {
      if (entry.proc) {
        console.log(`Killing process for old video ${id}`);
        entry.proc.kill();
      }
      console.log(`Deleting old video ${id}`);
      if (await Bun.file(entry.filePath).exists()) {
        await Bun.remove(entry.filePath).catch(() => {});
      }
      delete videoMap[id];
    }
  }

  for (const f of files) {
    const fullPath = `${downloadsDir}/${f.name}`;
    const tracked = Object.values(videoMap).some(
      (e) => e.filePath === fullPath,
    );
    if (!tracked) {
      console.log(`Deleting orphan file ${f.name}`);
      try {
        await Bun.remove(fullPath);
      } catch {}
    }
  }
}

function checkUrl(url: string) {
  return (
    typeof url === "string" &&
    url.length < MAX_URL_LENGTH &&
    url.startsWith("http") &&
    !/\s|\n/.test(url)
  );
}

// ---- API Server ----
async function main() {
  await cleanupDownloads();
  await updateYtDlp();

  setInterval(cleanupDownloads, 1000);

  Bun.serve({
    port: env.PORT,
    hostname: env.BIND_ADDR,
    fetch: async (req) => {
      const url = new URL(req.url);

      // ---- POST /api/download ----
      if (req.method === "POST" && url.pathname === "/api/download") {
        const body = await req.json().catch(() => null);

        if (!body?.url || !checkUrl(body.url)) {
          return new Response("invalid url", { status: 400 });
        }

        try {
          await updateYtDlp();
        } catch {
          return new Response("yt-dlp update failed", { status: 500 });
        }

        const id = crypto.randomUUID();
        const filePath = `${downloadsDir}/${id}.mp4`;

        const args = [
          "-f",
          "mp4",
          "--max-filesize",
          env.MAX_FILESIZE,
          "-o",
          filePath,
          body.url,
        ];

        console.log(`New download starting: ${id}`);

        const proc = Bun.spawn([YT_DLP_PATH, ...args], {
          stdout: "ignore",
          stderr: "pipe",
        });

        videoMap[id] = {
          proc,
          startTime: Date.now(),
          filePath,
          state: "started",
        };

        (async () => {
          for await (const _chunk of proc.stderr) {
            if (videoMap[id]?.state === "started") {
              videoMap[id].state = "downloading";
            }
          }
        })();

        proc.exited.then((code) => {
          if (code === 0) {
            videoMap[id].state = "finished";
            console.log(`Download finished: ${id}`);
          } else {
            videoMap[id].state = "failed";
            console.log(`Download failed for ${id} code=${code}`);
          }
          videoMap[id].proc = null;
        });

        return Response.json({ download_id: id }, { status: 202 });
      }

      // ---- GET /api/progress/:id ----
      if (req.method === "GET" && url.pathname.startsWith("/api/progress/")) {
        const id = url.pathname.replace("/api/progress/", "");
        const entry = videoMap[id];
        if (!entry) return new Response("not found", { status: 404 });
        return Response.json({ id, state: entry.state }, { status: 200 });
      }

      // ---- GET /api/download/:id ----
      if (req.method === "GET" && url.pathname.startsWith("/api/download/")) {
        const id = url.pathname.replace("/api/download/", "");
        const entry = videoMap[id];
        if (!entry) return new Response("not found", { status: 404 });

        if (entry.state !== "finished") {
          let statusCode =
            entry.state === "failed"
              ? 409
              : entry.state === "downloading" || entry.state === "started"
              ? 202
              : 409;
          return Response.json({ status: entry.state }, { status: statusCode });
        }

        if (!(await Bun.file(entry.filePath).exists())) {
          return new Response("file not found", { status: 404 });
        }

        const stream = Bun.file(entry.filePath).stream();
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="${id}.mp4"`,
          },
        });
      }

      return new Response("not found", { status: 404 });
    },
  });

  console.log(`Server running at http://${env.BIND_ADDR}:${env.PORT}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  Bun.exit(1);
});


