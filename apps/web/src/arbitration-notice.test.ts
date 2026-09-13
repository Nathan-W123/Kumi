/**
 * The mark on an arbitration line is for the gateway, not for the reader.
 *
 * A hold is the held agent's own sentence in its own thread — "Looks like
 * @Codex has the same files open, I'll start once they're done" — and it has
 * to read as that agent speaking, like every other line in the thread. The
 * symbol on the front is only how the gateway finds the line again in order to
 * take it back once the collision is over, so the browser takes it off and
 * draws the words and nothing else.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { defaultPublicDirectory } from "./assets.js";

async function publicFile(name: string): Promise<string> {
  return await readFile(path.join(defaultPublicDirectory(), name), "utf8");
}

function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(start, -1, `${from} should exist`);
  assert.notEqual(end, -1, `${from} should end at ${to}`);
  return source.slice(start, end);
}

test("the arbitration marker is stripped so the thread bubble reads as agent speech", async () => {
  const chats = await publicFile("screen-chats.js");
  const gateway = await readFile(
    path.join(
      defaultPublicDirectory(),
      "../../../services/api-gateway/src/task-narration.ts",
    ),
    "utf8",
  );

  // The two sides have to agree about the opening or the browser strips the
  // wrong number of characters off somebody's first word.
  assert.match(gateway, /export const CHANNEL_ARBITRATION_PREFIX = "⚖️";/u);
  assert.match(chats, /const ARBITRATION_NOTICE_PREFIX = "⚖️ ";/u);

  // Listed with the other protocol markers, and deliberately without an icon:
  // a pause and an expiry are notices about the run, while this one's words
  // are the agent's own and belong in the bubble with nothing in front of them.
  const icons = slice(chats, "const NOTICE_ICONS = [", "];");
  assert.match(
    icons,
    /\{ prefix: ARBITRATION_NOTICE_PREFIX, marker: ARBITRATION_NOTICE_PREFIX \}/u,
  );
  assert.doesNotMatch(
    icons,
    /prefix: ARBITRATION_NOTICE_PREFIX[^}]*iconName/u,
    "the agent's own sentence was given notice chrome",
  );

  // The marker is taken off whichever branch runs, and only a notice with an
  // icon gets the wrapper — otherwise the body is returned as it is.
  const body = slice(
    chats,
    "function messageBodyWithIcons",
    "const AGENT_AUTHORED_ROOT_KINDS",
  );
  assert.match(body, /content\.slice\(notice\.marker\.length\)/u);
  assert.match(body, /notice\.iconName === undefined\s*\?\s*body/u);
  assert.match(body, /cmsg-library-notice/u);

  // Roots and thread replies render through the same row, which is what puts
  // the stripping in front of a hold now that a hold is a reply.
  assert.match(chats, /messageBodyWithIcons\(entry, repositoryId\)/u);
});

test("the contract-collision marker is stripped too, and is not the hold's", async () => {
  const chats = await publicFile("screen-chats.js");
  const gateway = await readFile(
    path.join(
      defaultPublicDirectory(),
      "../../../services/api-gateway/src/task-narration.ts",
    ),
    "utf8",
  );

  // Same agreement as above, about the other line the gateway takes back:
  // "@Hades changed something this branch is built on". Disagree about the
  // opening and the browser strips the wrong number of characters off the
  // first word of somebody's warning.
  assert.match(
    gateway,
    /export const CHANNEL_CONTRACT_COLLISION_PREFIX = "\u26a0\ufe0f";/u,
  );
  assert.match(
    chats,
    /const CONTRACT_COLLISION_NOTICE_PREFIX = "\u26a0\ufe0f ";/u,
  );

  // And they must not be the same mark. The gateway recognises a hold by one
  // opening and a collision by the other, and it retires them on opposite
  // conditions — a hold when its task stops, a collision when the branches
  // stop colliding, which outlives the task by the life of the branch. One
  // mark for both would have the next admission in a thread quietly replace
  // a live warning, and the sweep delete it the moment the task settled.
  assert.doesNotMatch(
    gateway,
    /export const CHANNEL_CONTRACT_COLLISION_PREFIX = "\u2696\ufe0f";/u,
    "the collision line was given the arbitration mark",
  );

  // Listed with the other protocol markers and, like the hold, with no icon:
  // the words are the agent's own and belong in the bubble with nothing in
  // front of them.
  const icons = slice(chats, "const NOTICE_ICONS = [", "];");
  assert.match(
    icons,
    /prefix: CONTRACT_COLLISION_NOTICE_PREFIX,\s*\n?\s*marker: CONTRACT_COLLISION_NOTICE_PREFIX/u,
  );
  assert.doesNotMatch(
    icons,
    /prefix: CONTRACT_COLLISION_NOTICE_PREFIX[^}]*iconName/u,
    "the agent's own sentence was given notice chrome",
  );
});
