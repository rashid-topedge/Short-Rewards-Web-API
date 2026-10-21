import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * Extracts the duration of a video file (in whole seconds) using ffprobe.
 *
 * ffprobe is only available if ffmpeg is installed on the host. When it is
 * missing, or the file is not a decodable video, this resolves to `null`
 * rather than throwing — callers treat that as "duration unknown".
 */
export async function getVideoDuration(buffer: Buffer): Promise<number | null> {
  const tempDir = path.join(os.tmpdir(), "drama-upload-tmp");
  const tempFile = path.join(tempDir, `probe_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(tempFile, buffer);
  } catch {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "format=duration:stream=duration",
      "-of", "json",
      tempFile,
    ]);

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ duration?: string }>;
    };

    const candidates = [
      parsed.format?.duration,
      parsed.streams?.[0]?.duration,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const seconds = Number.parseFloat(candidate);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return Math.round(seconds);
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // best-effort cleanup
    }
  }
}
