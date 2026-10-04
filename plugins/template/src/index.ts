// src/index.ts — DEBUG version
import { React, ReactNative } from "@vendetta/metro/common";
import { logger } from "@vendetta";
import { storage } from "@vendetta/plugin";
import Settings from "./Settings";

const EMOJI_CHAR =
  "(?:\\u00a9|\\u00ae|[\\u2000-\\u3300]|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff])";
const EMOJI_RE = new RegExp(
  `(${EMOJI_CHAR}\\ufe0f?(?:\\u200d${EMOJI_CHAR}\\ufe0f?)*)`,
  "g"
);

const CDN =
  "https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/img-apple-160";

function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .filter((c) => c !== "fe0f")
    .join("-");
}

function EmojiImage(props: { emoji: string; size: number }) {
  return React.createElement(ReactNative.Image, {
    source: { uri: `${CDN}/${emojiToCodepoint(props.emoji)}.png` },
    style: { width: props.size, height: props.size, marginHorizontal: 1 },
    resizeMode: "contain",
  });
}

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
      } else out.push(r);
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

let unpatch: (() => void) | null = null;
let renderCount = 0;
let hitCount = 0;

function patchText() {
  const Text: any = (ReactNative as any).Text;
  const proto = Text?.prototype;

  logger.log(
    "[AppleEmojis] patch target — Text:",
    !!Text,
    "proto:",
    !!proto,
    "render:",
    typeof proto?.render
  );

  if (!proto || typeof proto.render !== "function") {
    logger.error("[AppleEmojis] Text.render not found, aborting patch");
    return;
  }

  const original = proto.render;

  proto.render = function () {
    renderCount++;
    const ret = original.call(this);
    if (!storage.enabled || !React.isValidElement(ret)) return ret;

    const size = Math.round(fontSizeOf((this.props as any)?.style) * 1.25);

    try {
      const kids = (ret.props as any)?.children;
      if (kids == null) return ret;

      // log first few string children so we can see what's flowing through
      if (renderCount < 20) {
        logger.log(
          "[AppleEmojis] render #" + renderCount + " children type:",
          typeof kids,
          "sample:",
          typeof kids === "string" ? kids.slice(0, 40) : "(not string)"
        );
      }

      const newKids = walk(kids, size);
      if (newKids !== kids) {
        hitCount++;
        if (hitCount < 10) logger.log("[AppleEmojis] HIT — emoji swapped");
      }
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

  logger.log("[AppleEmojis] patch applied");
}

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
