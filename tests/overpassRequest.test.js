import test from "node:test";
import assert from "node:assert/strict";
import {
  requestOverpassBuildings,
  getOverpassFailureMessage,
} from "../src/earth/overpassRequest.js";

test("retries a temporary Overpass 502 once and returns the recovered response", async () => {
  let calls = 0;
  const waits = [];
  const response = { ok: true, status: 200 };

  const result = await requestOverpassBuildings("[out:json];out;", {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 502 } : response;
    },
    random: () => 0.5,
    wait: async (duration) => waits.push(duration),
  });

  assert.equal(result, response);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [400]);
});

test("does not immediately retry an Overpass rate limit", async () => {
  let calls = 0;

  await assert.rejects(
    requestOverpassBuildings("[out:json];out;", {
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 429 };
      },
      wait: async () => assert.fail("429 must not be retried immediately"),
    }),
    (error) => error.status === 429
  );

  assert.equal(calls, 1);
});

test("does not make an Overpass request while offline", async () => {
  let calls = 0;

  await assert.rejects(
    requestOverpassBuildings("[out:json];out;", {
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200 };
      },
      isOnline: () => false,
    }),
    (error) => error.code === "NETWORK_OFFLINE"
  );

  assert.equal(calls, 0);
});

test("aborted Overpass requests are never retried", async () => {
  const controller = new AbortController();
  let calls = 0;

  await assert.rejects(
    requestOverpassBuildings("[out:json];out;", {
      signal: controller.signal,
      fetchImpl: async () => {
        calls += 1;
        controller.abort();
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    }),
    (error) => error.name === "AbortError"
  );

  assert.equal(calls, 1);
});

test("reports offline and overloaded Overpass states in plain Indonesian", () => {
  assert.match(getOverpassFailureMessage({ status: 502 }), /sibuk/);
  assert.match(getOverpassFailureMessage({ status: 429 }), /membatasi/);
  assert.match(getOverpassFailureMessage({ code: "NETWORK_OFFLINE" }, () => false), /internet/);
});
