/**
 * Two different 401s, and the minute of wasted effort between them.
 *
 * A run whose CLI was refused and a run whose CLI had nothing to send both
 * come back as 401s, and the narration read every one of them as an expired
 * sign-in. For the second kind that is the most confidently wrong thing it
 * can say: the account is fine, the person is sent to sign in again, they are
 * told they are already connected, and the next run fails identically.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  explainAnswerFailure,
  explainTaskFailure,
  isMissingVendorCredential,
  isVendorSignInFailure,
} from "./task-narration.js";

/** Verbatim from a codex run that reached OpenAI carrying nothing. */
const MISSING =
  "The codex CLI exited 1: unexpected status 401 Unauthorized: Missing " +
  "bearer or basic authentication in header, url: " +
  "https://api.openai.com/v1/responses, cf-ray: a40cb8a76992fa62-SJC, " +
  "request id: req_97ac5e8557a94d4cbf82fea05c32bb4c";

/** And one where a credential was sent and turned down. */
const EXPIRED = "OAuth session expired; run `codex login` to sign in again";

test("a request that carried no credential is not reported as a lapsed one", () => {
  assert.equal(isVendorSignInFailure(MISSING), true);
  assert.equal(isMissingVendorCredential(MISSING), true);

  const said = explainAnswerFailure(MISSING);
  // The claim that sent somebody to re-sign an account that was never
  // refused. Its absence is the whole point of the branch.
  assert.doesNotMatch(said, /sign-in has expired/u);
  assert.match(said, /not an account that lapsed|is not lapsed, it is missing/u);
  // And the evidence still travels, so a wrong reading stays falsifiable.
  assert.match(said, /Missing bearer/u);
});

test("a credential that was sent and refused still reads as expired", () => {
  assert.equal(isMissingVendorCredential(EXPIRED), false);
  assert.match(explainTaskFailure(EXPIRED), /sign-in has expired/u);
});

test("both readings keep their hands off somebody else's credential", () => {
  // The push path fails in GitHub's name with the same vocabulary, and
  // reconnecting an agent is the wrong door for it.
  const github = "remote: 401 Unauthorized while pushing to github.com";
  assert.equal(isVendorSignInFailure(github), false);
  assert.equal(isMissingVendorCredential(github), false);
});

test("a number that only looks like a status code is neither", () => {
  // The bound `IS_AUTH_FAILURE_RE` already draws: a version, an id, a hashed
  // path. A bare `401` in prose is still read as a status code, which is the
  // existing trade and not this branch's to change.
  const innocent = "built 1.401.0 and wrote x-401-y.log";
  assert.equal(isVendorSignInFailure(innocent), false);
  assert.equal(isMissingVendorCredential(innocent), false);
});

test("an unsigned CLI says so whichever way the turn was asked", () => {
  // A question and a task fail through two different functions, and a reader
  // hitting this through one of them should not get better advice than a
  // reader hitting it through the other.
  for (const said of [explainAnswerFailure(MISSING), explainTaskFailure(MISSING)]) {
    assert.doesNotMatch(said, /sign-in has expired/u);
    assert.match(said, /sent no credentials at all|is not lapsed, it is missing/u);
  }
});
