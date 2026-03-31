import { Monitor, Window } from "node-screenshots";
import sharp from "sharp";

const MAX_WIDTH = 1920;

export interface WindowInfo {
  id: number;
  title: string;
  appName: string;
}

export function listWindows(): WindowInfo[] {
  return Window.all().map((w) => ({
    id: w.id(),
    title: w.title(),
    appName: w.appName(),
  }));
}

export async function captureScreen(): Promise<string> {
  const monitors = Monitor.all();
  const target = monitors.find((m) => m.isPrimary()) ?? monitors[0];
  if (!target) throw new Error("No monitor found");
  const image = await target.captureImage();
  const png = await image.toPng();
  return resizeToJpegBase64(png);
}

export async function captureWindow(windowId: number): Promise<string> {
  const win = Window.all().find((w) => w.id() === windowId);
  if (!win) throw new Error(`Window not found: ${windowId}`);
  if (win.isMinimized()) throw new Error(`Window is minimized: ${windowId}`);
  if (win.width() === 0 || win.height() === 0) {
    throw new Error(`Window has invalid dimensions: ${windowId}`);
  }
  const image = await win.captureImage();
  const png = await image.toPng();
  return resizeToJpegBase64(png);
}

async function resizeToJpegBase64(png: Buffer): Promise<string> {
  const jpeg = await sharp(png)
    .resize(MAX_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg.toString("base64");
}
