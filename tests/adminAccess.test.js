import test from "node:test";
import assert from "node:assert/strict";
import { isTuntasAdminUser } from "../src/lib/adminAccess.js";

const adminId = "b6521de4-d0f7-442f-a0cc-89bd26dc9729";
const adminEmail = "zeynn.belajar@gmail.com";

test("authorizes only the configured admin account", () => {
  assert.equal(isTuntasAdminUser({ id: adminId, email: adminEmail }), true);
});

test("does not authorize a different user with the admin email", () => {
  assert.equal(
    isTuntasAdminUser({ id: "00000000-0000-4000-8000-000000000000", email: adminEmail }),
    false
  );
});

test("does not authorize the configured user id with another email", () => {
  assert.equal(isTuntasAdminUser({ id: adminId, email: "someone@example.com" }), false);
});

test("normalizes email casing and surrounding whitespace", () => {
  assert.equal(isTuntasAdminUser({ id: adminId, email: "  ZEYNN.BELAJAR@GMAIL.COM " }), true);
});

test("rejects incomplete or unauthenticated user objects", () => {
  assert.equal(isTuntasAdminUser(null), false);
  assert.equal(isTuntasAdminUser({ email: adminEmail }), false);
  assert.equal(isTuntasAdminUser({ id: adminId }), false);
});
