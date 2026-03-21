#!/usr/bin/env tsx
import { Webview, webviewSource, audio } from "@hmcs/sdk";
import { output } from "@hmcs/sdk/commands";

const CHAT_UI_ASSET = "desktopmate-bridge:chat-ui";

try {
  const webviews = await Webview.list();
  const existing = webviews.find(
    (w) => w.source.type === "local" && (w.source as { id: string }).id === CHAT_UI_ASSET,
  );

  if (existing && !(await new Webview(existing.entity).isClosed())) {
    await new Webview(existing.entity).close();
    await audio.se.play("se:close");
  } else {
    await Webview.open({
      source: webviewSource.local(CHAT_UI_ASSET),
      size: [0.9, 1.0],
      viewportSize: [700, 600],
      offset: [1.1, 0],
    });
    await audio.se.play("se:open");
  }
  output.succeed();
} catch (e) {
  output.fail("TOGGLE_CHAT_FAILED", (e as Error).message);
}
