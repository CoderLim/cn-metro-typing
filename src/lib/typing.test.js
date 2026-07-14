import test from "node:test";
import assert from "node:assert/strict";
import { stationTarget, normalizeInput, charMatches, LANG } from "./typing.js";

const station = {
  nameZh: "一大会址·新天地",
  nameEn: "Site of the First CPC National Congress · Xintiandi",
  target: "site of the first cpc national congress xintiandi",
};

test("中文目标去掉间隔号", () => {
  assert.equal(stationTarget(station, LANG.CHINESE), "一大会址新天地");
});

test("英文目标用 target 小写", () => {
  assert.equal(
    stationTarget(station, LANG.ENGLISH),
    "site of the first cpc national congress xintiandi",
  );
});

test("英文目标保留撇号与 &", () => {
  assert.equal(
    stationTarget({ target: "people's square" }, LANG.ENGLISH),
    "people's square",
  );
  assert.equal(
    stationTarget({ target: "pudong airport terminal 1&2" }, LANG.ENGLISH),
    "pudong airport terminal 1&2",
  );
});

test("拼音目标用全拼连打", () => {
  assert.equal(
    stationTarget({ pinyin: "renminguangchang" }, LANG.PINYIN),
    "renminguangchang",
  );
  assert.ok(!stationTarget({}, LANG.PINYIN));
});

test("中文输入归一化去符号", () => {
  assert.equal(normalizeInput("新·天，地", LANG.CHINESE), "新天地");
});

test("英文比对大小写不敏感", () => {
  assert.ok(charMatches("P", "p", LANG.ENGLISH));
  assert.ok(charMatches(" ", " ", LANG.ENGLISH));
  assert.ok(!charMatches("q", "p", LANG.ENGLISH));
});

test("中文比对逐字", () => {
  assert.ok(charMatches("新", "新", LANG.CHINESE));
  assert.ok(!charMatches("旧", "新", LANG.CHINESE));
});
