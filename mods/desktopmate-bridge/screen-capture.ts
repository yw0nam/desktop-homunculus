import { Monitor, Window } from "node-screenshots";

export interface WindowInfo {
  id: string;
  title: string;
}

export interface CaptureResult {
  base64: string;
}

export async function listWindows(): Promise<WindowInfo[]> {
  return Window.all().map((w) => ({
    id: String(w.id()),
    title: w.title(),
  }));
}

export async function captureScreen(): Promise<CaptureResult> {
  const monitors = Monitor.all();
  const primary = monitors.find((m) => m.isPrimary()) ?? monitors[0];
  const image = await primary.captureImage();
  const png = await image.toPng();
  return { base64: png.toString("base64") };
}

export async function captureWindow(id: string): Promise<CaptureResult> {
  const window = Window.all().find((w) => String(w.id()) === id);
  if (!window) throw new Error(`Window not found: ${id}`);
  const image = await window.captureImage();
  const png = await image.toPng();
  return { base64: png.toString("base64") };
}
