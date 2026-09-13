/**
 * The warning nobody else gives, and the cases where it must stay quiet.
 *
 * A false one of these is expensive in a way a missed one is not: it sends
 * somebody to read a file that is fine, and a warning people learn to
 * disbelieve is worse than no warning. So most of what is asserted here is
 * silence — the shapes that look like a collision and are not.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { BranchClaim, ClaimedShape } from "@coord/persistence";

import {
  collisionsAgainst,
  contractCollisionLine,
  contractCollisions,
} from "./contract-collisions.js";

function shape(overrides: Partial<ClaimedShape> & { symbol: string }): ClaimedShape {
  return {
    file: "src/auth.ts",
    shape: "(password: string): string",
    digest: "abc123",
    consumers: [],
    ...overrides,
  };
}

function claim(overrides: Partial<BranchClaim> & { branch: string }): BranchClaim {
  return {
    id: `claim_${overrides.branch}`,
    repositoryId: "repo_1",
    taskId: `task_${overrides.branch}`,
    revision: "rev1",
    symbols: [],
    apis: [],
    schemas: [],
    configKeys: [],
    services: [],
    ranges: [],
    shapes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** The collision this exists for: A moved `sign`, B calls it, git is happy. */
const MOVER = claim({
  branch: "payments",
  shapes: [
    shape({
      symbol: "sign",
      shape: "(password: number): string",
      moved: true,
      consumers: ["src/login.ts"],
    }),
  ],
});

const CONSUMER = claim({
  branch: "login",
  ranges: [{ file: "src/login.ts", start: 1, end: 40 }],
});

test("a contract one branch moved, in a file another branch has open", () => {
  assert.deepEqual(contractCollisions([MOVER, CONSUMER]), [
    {
      movedOn: "payments",
      consumedOn: "login",
      file: "src/auth.ts",
      symbol: "sign",
      shape: "(password: number): string",
      consumer: "src/login.ts",
      inferred: false,
    },
  ]);
});

test("a contract that did not move is not a collision", () => {
  // Every exported shape in every file a diff touched is recorded, changed or
  // not. Reading presence as a change would warn about nearly every branch
  // that has ever touched a file with an export in it.
  const unmoved = claim({
    branch: "payments",
    shapes: [shape({ symbol: "sign", moved: false, consumers: ["src/login.ts"] })],
  });
  assert.deepEqual(contractCollisions([unmoved, CONSUMER]), []);
});

test("a contract nobody compared is not reported as unchanged, and not reported at all", () => {
  // `moved` absent means no comparison was made — an older claim, or a
  // canonical index that would not build. It is not "nothing changed", and it
  // is not grounds to tell somebody their code is about to break either. The
  // honest answer to an unmeasured contract is to say nothing about it.
  const unmeasured = claim({
    branch: "payments",
    shapes: [shape({ symbol: "sign", consumers: ["src/login.ts"] })],
  });
  assert.deepEqual(contractCollisions([unmeasured, CONSUMER]), []);
});

test("a branch does not collide with itself", () => {
  const alone = claim({
    branch: "payments",
    ranges: [{ file: "src/login.ts", start: 1, end: 9 }],
    shapes: [
      shape({ symbol: "sign", moved: true, consumers: ["src/login.ts"] }),
    ],
  });
  assert.deepEqual(contractCollisions([alone]), []);
});

test("branches in different repositories never meet", () => {
  const elsewhere = { ...CONSUMER, repositoryId: "repo_2" };
  assert.deepEqual(contractCollisions([MOVER, elsewhere]), []);
});

test("a consumer nobody has open is not a collision", () => {
  // The whole point is that somebody is working in the file. A moved contract
  // with consumers nobody is touching is just a change.
  const elsewhere = claim({
    branch: "docs",
    ranges: [{ file: "README.md", start: 1, end: 2 }],
  });
  assert.deepEqual(contractCollisions([MOVER, elsewhere]), []);
});

test("the declaring file is not a consumer of itself", () => {
  // Two branches in `auth.ts` collide over the file, which the ranges already
  // say. Saying it again as a contract collision is the same news twice.
  const mover = claim({
    branch: "payments",
    shapes: [
      shape({ symbol: "sign", moved: true, consumers: ["src/auth.ts"] }),
    ],
  });
  const alsoInAuth = claim({
    branch: "login",
    ranges: [{ file: "src/auth.ts", start: 80, end: 90 }],
  });
  assert.deepEqual(contractCollisions([mover, alsoInAuth]), []);
});

test("a claim with no ranges still shows the files its shapes name", () => {
  // Ranges are advisory and a claim can be written without them; the files a
  // diff touched are still named by the shapes recorded for them.
  const byShapesOnly = claim({
    branch: "login",
    shapes: [
      shape({ file: "src/login.ts", symbol: "handler", digest: "zzz" }),
    ],
  });
  assert.deepEqual(
    contractCollisions([MOVER, byShapesOnly]).map((entry) => entry.consumedOn),
    ["login"],
  );
});

test("a collision is reported once, however many ways it is recorded", () => {
  // The same file reached three ways: two ranges, a shape of its own, and a
  // consumer list that names it twice — which a claim written from an index
  // that saw the file through two edges will do.
  const repeated = claim({
    branch: "payments",
    shapes: [
      shape({
        symbol: "sign",
        moved: true,
        consumers: ["src/login.ts", "src/login.ts"],
      }),
    ],
  });
  const twice = claim({
    branch: "login",
    ranges: [
      { file: "src/login.ts", start: 1, end: 10 },
      { file: "src/login.ts", start: 30, end: 40 },
    ],
    shapes: [shape({ file: "src/login.ts", symbol: "handler", digest: "zzz" })],
  });
  assert.equal(contractCollisions([repeated, twice]).length, 1);
});

test("both sides of a collision are found, and each branch hears its own half", () => {
  // Neither branch is the victim: each is equally surprised, and each one's
  // thread is where its own half belongs.
  const a = claim({
    branch: "payments",
    ranges: [{ file: "src/pay.ts", start: 1, end: 5 }],
    shapes: [
      shape({ symbol: "sign", moved: true, consumers: ["src/login.ts"] }),
    ],
  });
  const b = claim({
    branch: "login",
    ranges: [{ file: "src/login.ts", start: 1, end: 5 }],
    shapes: [
      shape({
        file: "src/session.ts",
        symbol: "renew",
        moved: true,
        consumers: ["src/pay.ts"],
        digest: "def456",
      }),
    ],
  });
  assert.deepEqual(
    contractCollisions([a, b]).map((entry) => `${entry.movedOn}->${entry.consumedOn}`),
    ["payments->login", "login->payments"],
  );
  assert.deepEqual(
    collisionsAgainst("login", [a, b]).map((entry) => entry.symbol),
    ["sign"],
  );
  assert.deepEqual(
    collisionsAgainst("payments", [a, b]).map((entry) => entry.symbol),
    ["renew"],
  );
});

/* ---------------------------------------------------------- the sentence -- */

test("the line says what changed, where it touches, and that git will not catch it", () => {
  const line = contractCollisionLine(collisionsAgainst("login", [MOVER, CONSUMER]));
  assert.equal(
    line,
    "payments changed something this branch is built on: `sign` in src/auth.ts — " +
      "src/login.ts uses it. Git will merge these cleanly — none of it will show " +
      "up as a conflict.",
  );
});

test("a branch is named the way the room names it", () => {
  const line = contractCollisionLine(
    collisionsAgainst("login", [MOVER, CONSUMER]),
    (branch) => `#${branch}`,
  );
  assert.ok(line?.startsWith("#payments changed"), line);
});

test("nothing to say is said as nothing", () => {
  assert.equal(contractCollisionLine([]), undefined);
});

test("a long list is counted rather than recited", () => {
  const many = claim({
    branch: "payments",
    shapes: ["sign", "verify", "issue", "revoke"].map((symbol) =>
      shape({ symbol, moved: true, consumers: ["src/login.ts"], digest: symbol }),
    ),
  });
  const line = contractCollisionLine(collisionsAgainst("login", [many, CONSUMER]));
  assert.match(line ?? "", /`issue` in src\/auth\.ts — src\/login\.ts uses it/u);
  assert.match(line ?? "", /and 2 more\./u);
});

test("several branches moving things are counted, not all named", () => {
  const second = claim({
    branch: "sessions",
    shapes: [
      shape({
        file: "src/session.ts",
        symbol: "renew",
        moved: true,
        consumers: ["src/login.ts"],
        digest: "def456",
      }),
    ],
  });
  const line = contractCollisionLine(
    collisionsAgainst("login", [MOVER, second, CONSUMER]),
  );
  assert.match(line ?? "", /^payments and 1 other branch changed/u);
});

test("an inferred contract says the warning is less than the whole story", () => {
  // A consumer of an inferred symbol cannot be told everything that changed,
  // and a warning that implied otherwise would be claiming a certainty the
  // shape reader never had.
  const inferred = claim({
    branch: "payments",
    shapes: [
      shape({
        symbol: "sign",
        moved: true,
        inferred: true,
        consumers: ["src/login.ts"],
      }),
    ],
  });
  const line = contractCollisionLine(collisionsAgainst("login", [inferred, CONSUMER]));
  assert.match(line ?? "", /inferred rather than written down/u);
});
