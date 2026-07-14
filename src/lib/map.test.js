import test from "node:test";
import assert from "node:assert/strict";
import { lineRuns, runStations, DIRECTION } from "./map.js";

const line = {
  loop: false,
  stations: [
    { stationId: "a", nameZh: "甲" },
    { stationId: "b", nameZh: "乙" },
    { stationId: "c", nameZh: "丙" },
    { stationId: "d", nameZh: "丁" },
  ],
  segments: [
    ["a", "b", "c"],
    ["a", "b", "d"],
  ],
};

test("支线各成一个区间", () => {
  const runs = lineRuns(line);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].label, "甲 → 丙");
  assert.equal(runs[1].label, "甲 → 丁");
});

test("反向行驶翻转站序", () => {
  const stations = runStations(line, 1, DIRECTION.REVERSE);
  assert.deepEqual(
    stations.map((s) => s.nameZh),
    ["丁", "乙", "甲"],
  );
});

test("无 segments 时全线为一个区间", () => {
  const simple = { stations: line.stations.slice(0, 2) };
  assert.equal(lineRuns(simple)[0].stations.length, 2);
});
