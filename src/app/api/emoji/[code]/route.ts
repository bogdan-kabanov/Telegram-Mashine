import { existsSync, readFileSync } from "fs";

import { appleEmojiFilePath } from "@/lib/emoji/apple-server";

export const runtime = "nodejs";

type Params = { params: Promise<{ code: string }> };

/** Serve Apple Color Emoji PNG from emoji-datasource-apple for admin preview. */
export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  if (!/^[0-9a-f]+(?:-[0-9a-f]+)*$/i.test(code)) {
    return new Response("Bad request", { status: 400 });
  }

  const file = appleEmojiFilePath(code.toLowerCase());
  if (!existsSync(file)) {
    return new Response("Not found", { status: 404 });
  }

  const body = readFileSync(file);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
