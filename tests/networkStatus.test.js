import test from "node:test";
import assert from "node:assert/strict";
import { isNetworkUnavailable } from "../src/lib/networkStatus.js";

test("detects Chrome fetch and network disconnection messages", () => {
  assert.equal(isNetworkUnavailable(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkUnavailable(new Error("Network changed")), true);
  assert.equal(isNetworkUnavailable(new Error("Internet disconnected")), true);
});

test("uses the browser online state when the SDK error has no useful message", () => {
  assert.equal(isNetworkUnavailable(new Error("Unknown error"), false), true);
  assert.equal(isNetworkUnavailable(new Error("Unknown error"), true), false);
});

test("does not classify database permission errors as network failures", () => {
  assert.equal(isNetworkUnavailable(new Error("permission denied for table reports"), true), false);
});
