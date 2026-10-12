import test from "node:test";
import assert from "node:assert/strict";
import { highlightStyle } from "../src/highlights.js";
import { sample, validateSite } from "../src/model.js";
test("highlight intensity rejects invalid persisted levels and defaults older links", () => {
  assert.deepEqual(
    highlightStyle({}),
    highlightStyle({ highlightIntensity: 2 }),
  );
  for (const value of [0, 6, 1.5, "3", null]) {
    const site = structuredClone(sample);
    site.links[0].highlightIntensity = value;
    assert.throws(() => validateSite(site), /intensity/);
  }
  for (const value of [1, 5]) {
    const site = structuredClone(sample);
    site.links[0].highlightIntensity = value;
    assert.doesNotThrow(() => validateSite(site));
  }
});
test("dramatic levels increase movement, rotation, scale and glow within bounded speeds", () => {
  const subtle = highlightStyle({ highlightIntensity: 1 });
  const dramatic = highlightStyle({ highlightIntensity: 5 });
  for (const key of [
    "--highlight-distance",
    "--highlight-angle",
    "--highlight-scale",
    "--highlight-brightness",
    "--highlight-blur",
  ])
    assert.ok(parseFloat(dramatic[key]) > parseFloat(subtle[key]));
  assert.ok(parseFloat(dramatic["--highlight-period"]) >= 2.7);
  assert.deepEqual(highlightStyle({ highlightIntensity: 100 }), dramatic);
  assert.deepEqual(highlightStyle({ highlightIntensity: -100 }), subtle);
});
