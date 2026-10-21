import { test } from "node:test";
import assert from "node:assert/strict";
import { companyInput, contactInput, dealInput } from "../lib/validation";
test("CRM validation rejects malformed fields and keeps currency precise", () => {
  const deal = {
    name: "Website",
    value: "1250.99",
    stage: "Lead",
    companyId: "",
  };
  assert.equal(dealInput.parse(deal).value, 125099);
  assert.equal(dealInput.parse(deal).companyId, null);
  for (const value of ["-1", "Infinity", "1.999", "10000000", "", "abc"])
    assert.equal(dealInput.safeParse({ ...deal, value }).success, false);
  assert.equal(
    dealInput.safeParse({ ...deal, stage: "Invented" }).success,
    false,
  );
  assert.equal(
    companyInput.safeParse({ name: "", website: "", industry: "" }).success,
    false,
  );
  assert.equal(
    companyInput.safeParse({
      name: "Co",
      website: "javascript:alert(1)",
      industry: "",
    }).success,
    false,
  );
  assert.equal(
    contactInput.safeParse({
      name: "A",
      email: "wrong",
      phone: "",
      role: "",
      notes: "",
      companyId: "",
    }).success,
    false,
  );
  const validated = companyInput.parse({
    name: " Co ",
    website: "",
    industry: "",
    ownerId: "intruder",
  });
  assert.equal(validated.name, "Co");
  assert.equal("ownerId" in validated, false);
});
