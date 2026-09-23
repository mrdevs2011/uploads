const UZ_CONVERTER = (() => {
  const APOSTROPHE_RE = /[''`ʻʼʹʽ′’‘´ʻʾʿ]/;
  const CYR_VOWELS = "аеёиоуэюяўАЕЁИОУЭЮЯЎ";
  const LAT_VOWELS = "aeiouoʻAEIOUOʻ";

  function isWordBoundary(prev) {
    return !prev || /[\s.,;:!?()[\]{}"«»„“”/\\|<>=+\-*#@%$^~]/.test(prev);
  }

  function isCyrillicChar(ch) {
    return /[\u0400-\u04FF]/.test(ch);
  }

  function isLatinLetter(ch) {
    return /[A-Za-z]/.test(ch);
  }

  function applyCase(src, mapped) {
    if (!mapped) return mapped;
    const letters = [...src].filter((c) => /[A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ]/.test(c));
    if (letters.length === 0) return mapped;
    const allUpper = letters.every((c) => c === c.toUpperCase());
    if (allUpper && letters.length > 1) return mapped.toUpperCase();
    if (letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase()) {
      return mapped.charAt(0).toUpperCase() + mapped.slice(1);
    }
    return mapped.toLowerCase();
  }

  function normalizeApostropheTail(text, i) {
    const two = text.slice(i, i + 2);
    if (two.length === 2 && APOSTROPHE_RE.test(two[1])) return 2;
    return 0;
  }

  const LAT_MULTI = [
    ["yo", "ё"],
    ["yu", "ю"],
    ["ya", "я"],
    ["ye", "е"],
    ["ts", "ц"],
    ["sh", "ш"],
    ["ch", "ч"],
    ["sch", "щ"],
    ["ng", "нг"],
  ];

  const LAT_SINGLE = {
    a: "а",
    b: "б",
    d: "д",
    e: "е",
    f: "ф",
    g: "г",
    h: "ҳ",
    i: "и",
    j: "ж",
    k: "к",
    l: "л",
    m: "м",
    n: "н",
    o: "о",
    p: "п",
    q: "қ",
    r: "р",
    s: "с",
    t: "т",
    u: "у",
    v: "в",
    x: "х",
    y: "й",
    z: "з",
  };

  const CYR_SINGLE = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "yo",
    ж: "j",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "x",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sh",
    ъ: "ʼ",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
    ў: "oʻ",
    қ: "q",
    ғ: "gʻ",
    ҳ: "h",
  };

  function takeLatinToken(text, i, prev) {
    const rest = text.slice(i);
    const three = rest.slice(0, 3);
    if (three.toLowerCase() === "sch") {
      return { src: three, dst: applyCase(three, "щ"), len: 3 };
    }

    const oTail = rest[0] && rest[0].toLowerCase() === "o" ? normalizeApostropheTail(text, i) : 0;
    if (oTail) {
      const src = text.slice(i, i + oTail);
      return { src, dst: applyCase(src[0], "ў"), len: oTail };
    }
    const gTail = rest[0] && rest[0].toLowerCase() === "g" ? normalizeApostropheTail(text, i) : 0;
    if (gTail) {
      const src = text.slice(i, i + gTail);
      return { src, dst: applyCase(src[0], "ғ"), len: gTail };
    }

    const two = rest.slice(0, 2);
    const twoLow = two.toLowerCase();
    for (const [lat, cyr] of LAT_MULTI) {
      if (twoLow === lat) {
        return { src: two, dst: applyCase(two, cyr), len: 2 };
      }
    }

    const ch = rest[0];
    if (!ch) return null;
    const low = ch.toLowerCase();

    if (low === "e") {
      const mapped = isWordBoundary(prev) ? "э" : "е";
      return { src: ch, dst: applyCase(ch, mapped), len: 1 };
    }

    if (LAT_SINGLE[low]) {
      return { src: ch, dst: applyCase(ch, LAT_SINGLE[low]), len: 1 };
    }

    if (APOSTROPHE_RE.test(ch)) {
      return { src: ch, dst: "ъ", len: 1 };
    }

    return null;
  }

  function takeCyrToken(text, i, prev) {
    const ch = text[i];
    if (!ch || !isCyrillicChar(ch)) return null;
    const low = ch.toLowerCase();

    if (low === "е") {
      const ye = isWordBoundary(prev) || CYR_VOWELS.includes(prev);
      const mapped = ye ? "ye" : "e";
      return { src: ch, dst: applyCase(ch, mapped), len: 1 };
    }

    if (CYR_SINGLE[low] !== undefined) {
      return { src: ch, dst: applyCase(ch, CYR_SINGLE[low]), len: 1 };
    }

    return { src: ch, dst: ch, len: 1 };
  }

  function convertLatinToCyrillic(text) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const prev = i > 0 ? text[i - 1] : "";
      const tok = takeLatinToken(text, i, prev);
      if (tok) {
        out += tok.dst;
        i += tok.len;
      } else {
        out += text[i];
        i += 1;
      }
    }
    return out;
  }

  function convertCyrillicToLatin(text) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const prev = i > 0 ? text[i - 1] : "";
      const tok = takeCyrToken(text, i, prev);
      if (tok) {
        out += tok.dst;
        i += tok.len;
      } else {
        out += text[i];
        i += 1;
      }
    }
    return out;
  }

  function convertReplace(text) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const prev = i > 0 ? text[i - 1] : "";
      const ch = text[i];

      if (isCyrillicChar(ch)) {
        const tok = takeCyrToken(text, i, prev);
        out += tok ? tok.dst : ch;
        i += tok ? tok.len : 1;
        continue;
      }

      if (isLatinLetter(ch) || (APOSTROPHE_RE.test(ch) && /[A-Za-z]/.test(prev))) {
        const tok = takeLatinToken(text, i, prev);
        if (tok) {
          out += tok.dst;
          i += tok.len;
          continue;
        }
      }

      out += ch;
      i += 1;
    }
    return out;
  }

  function convert(text, mode) {
    if (!text) return "";
    if (mode === "lat2cyr") return convertLatinToCyrillic(text);
    if (mode === "cyr2lat") return convertCyrillicToLatin(text);
    return convertReplace(text);
  }

  return {
    convert,
    convertLatinToCyrillic,
    convertCyrillicToLatin,
    convertReplace,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.UZ_CONVERTER = UZ_CONVERTER;
}
