export const LANG = { ENGLISH: "en", CHINESE: "zh" };

const NON_WORD = /[^\p{Letter}\p{Number}]/gu;

// 打字目标：英文用官方英文名（小写），中文用去掉间隔号等符号的站名。
export function stationTarget(station, lang) {
  if (!station) return "";
  if (lang === LANG.CHINESE) {
    return (station.nameZh ?? "").normalize("NFKC").replace(NON_WORD, "");
  }
  return (station.target ?? station.nameEn ?? "").normalize("NFKC").toLowerCase();
}

// 输入法提交的整段文字在比对前的归一化。
export function normalizeInput(text, lang) {
  const t = text.normalize("NFKC");
  return lang === LANG.CHINESE ? t.replace(NON_WORD, "") : t;
}

export function charMatches(input, expected, lang) {
  if (!input || !expected) return false;
  if (lang === LANG.CHINESE) return input === expected;
  return input.toLowerCase() === expected;
}
