// src/index.ts
// name: AppleEmojis
// vendor: Vendetta / Bunny
// what: patches ReactNative.Text.render to swap unicode emoji for Apple
//       emoji PNGs. image set: iamcal/emoji-data img-apple-160 via jsDelivr.

import { React, ReactNative } from "@vendetta/metro/common";
import { logger } from "@vendetta";
import { storage } from "@vendetta/plugin";
import Settings from "./Settings";

// ── emoji detection ─────────────────────────────────────────────────────────
const EMOJI_CHAR =
  "(?:\\u00a9|\\u00ae|[\\u2000-\\u3300]|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff])";
const EMOJI_RE = new RegExp(
  `(${EMOJI_CHAR}\\ufe0f?(?:\\u200d${EMOJI_CHAR}\\ufe0f?)*)`,
  "g"
);

// ── image source ────────────────────────────────────────────────────────────
const CDN =
  "https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-160";

function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .filter((c) => c !== "fe0f")
    .join("-");
}

// ── the replacement node ────────────────────────────────────────────────────
function EmojiImage(props: { emoji: string; size: number }) {
  return React.createElement(ReactNative.Image, {
    source: { uri: `${CDN}/${emojiToCodepoint(props.emoji)}.png` },
    style: {
      width: props.size,
      height: props.size,
      marginHorizontal: 1,
    },
    resizeMode: "contain",
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fontSizeOf(style: any): number {
  if (!style) return 22;
  const flat = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style;
  return typeof flat?.fontSize === "number" ? flat.fontSize : 22;
}

function transformString(str: string, size: number): any {
  EMOJI_RE.lastIndex = 0;
  if (!EMOJI_RE.test(str)) return str;
  EMOJI_RE.lastIndex = 0;

  const out: any[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = EMOJI_RE.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push(
      React.createElement(EmojiImage, {
        key: `e-${m.index}-${m[0]}`,
        emoji: m[0],
        size,
      })
    );
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}

function walk(node: any, size: number): any {
  if (typeof node === "string") return transformString(node, size);

  if (Array.isArray(node)) {
    const out: any[] = [];
    for (let i = 0; i < node.length; i++) {
      const r = walk(node[i], size);
      if (Array.isArray(r)) {
        for (let j = 0; j < r.length; j++) {
          const x = r[j];
          out.push(
            React.isValidElement(x)
              ? React.cloneElement(x, { key: `${i}-${j}` })
              : x
          );
        }
      } else {
        out.push(r);
      }
    }
    return out;
  }

  if (React.isValidElement(node)) {
    const kids = (node.props as any)?.children;
    if (kids == null) return node;
    const newKids = walk(kids, size);
    if (newKids === kids) return node;
    return React.cloneElement(node, {}, newKids);
  }

  return node;
}

// ── patch ───────────────────────────────────────────────────────────────────
let unpatch: (() => void) | null = null;

function patchText() {
  const Text: any = (ReactNative as any).Text;
  const proto = Text?.prototype;

  if (!proto || typeof proto.render !== "function") {
    logger.error(
      "[AppleEmojis] ReactNative.Text.render not found — RN version may have changed Text internals"
    );
    return;
  }

  const original = proto.render;

  proto.render = function () {
    const ret = original.call(this);
    if (!storage.enabled || !React.isValidElement(ret)) return ret;

    const size = Math.round(fontSizeOf((this.props as any)?.style) * 1.25);

    try {
      const kids = (ret.props as any)?.children;
      if (kids == null) return ret;
      const newKids = walk(kids, size);
      if (newKids === kids) return ret;
      return React.cloneElement(ret, {}, newKids);
    } catch (e) {
      logger.error("[AppleEmojis] transform failed", e);
      return ret;
    }
  };

  unpatch = () => {
    proto.render = original;
  };
}

// ── lifecycle ───────────────────────────────────────────────────────────────
export function onLoad() {
  if (storage.enabled === undefined) storage.enabled = true;
  patchText();
  logger.log("[AppleEmojis] loaded");
}

export function onUnload() {
  unpatch?.();
  unpatch = null;
}

export const settings = Settings;
