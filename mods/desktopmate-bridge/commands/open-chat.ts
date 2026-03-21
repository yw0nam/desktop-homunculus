#!/usr/bin/env tsx
import { Webview, webviewSource, audio } from "@hmcs/sdk";
import { output } from "@hmcs/sdk/commands";

try {
  await Webview.open({
    source: webviewSource.local("desktopmate-bridge:chat-ui"),
    size: [0.9, 1.0],
    viewportSize: [700, 600],
    offset: [1.1, 0],
  });
  await audio.se.play("se:open");
  output.succeed();
} catch (e) {
  output.fail("OPEN_CHAT_FAILED", (e as Error).message);
}
