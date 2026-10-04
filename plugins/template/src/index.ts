// src/index.ts
// name: AppleEmojis
// vendor: Vendetta / Bunny / Revenge
// approach: hooks React.createElement at the module level. Text in modern
//           Discord is a functional component, so prototype.render patching
//           doesn't work anymore. createElement catches every Text render.

import { React, ReactNative } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
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

// ── patch: React.createElement ──────────────────────────────────────────────
let unpatch: (() => void) | null = null;

function patch() {
  // find the React module that Discord itself uses
  const reactModule: any =
    findByProps("createElement", "cloneElement", "isValidElement") ||
    findByProps("createElement", "Fragment");

  if (!reactModule || typeof reactModule.createElement !== "function") {
    logger.error(
      "[AppleEmojis] couldn't locate React module via findByProps — falling back to metro import"
    );
    return tryFallback();
  }

  // identify the Text component reference
  const TextComp: any = (ReactNative as any)?.Text;
  if (!TextComp) {
    logger.error("[AppleEmojis] ReactNative.Text missing");
    return;
  }

  logger.log("[AppleEmojis] patching React.createElement; Text ref present");

  const origCE = reactModule.createElement;
  let hits = 0;
  let passes = 0;

  reactModule.createElement = function (type: any, props: any, ...children: any[]) {
    passes++;
    if (type === TextComp && storage.enabled) {
      const size = Math.round(
        fontSizeOf(props?.style) * 1.25
      );
      const newChildren = children.map((c) => walk(c, size));
      const ret = origCE.call(this, type, props, ...newChildren);
      if (children.some((c, i) => newChildren[i] !== c)) {
        hits++;
        if (hits <= 5) logger.log("[AppleEmojis] HIT createElement #" + hits);
      }
      return ret;
    }
    return origCE.apply(this, arguments as any);
  };

  if (passes >= 0) logger.log("[AppleEmojis] patch installed");

  unpatch = () => {
    reactModule.createElement = origCE;
  };
}

function tryFallback() {
  const proto = (ReactNative as any)?.Text?.prototype;
  if (!proto || typeof proto.render !== "function") {
    logger.error("[AppleEmojis] no patchable target found");
    return;
  }
  logger.log("[AppleEmojis] using prototype.render fallback");
  const orig = proto.render;
  proto.render = function () {
    const ret = orig.call(this);
    if (!storage.enabled || !React.isValidElement(ret)) return ret;
    const size = Math.round(fontSizeOf((this.props as any)?.style) * 1.25);
    const kids = (ret.props as any)?.children;
    if (kids == null) return ret;
    const nk = walk(kids, size);
    return nk === kids ? ret : React.cloneElement(ret, {}, nk);
  };
  unpatch = () => {
    proto.render = orig;
  };
}

// ── lifecycle ───────────────────────────────────────────────────────────────
export function onLoad() {
  if (storage.enabled === undefined) storage.enabled = true;
  patch();
  logger.log("[AppleEmojis] loaded");
}

export function onUnload() {
  unpatch?.();
  unpatch = null;
}

export const settings = Settings;
