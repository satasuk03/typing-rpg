#!/usr/bin/env node
// Sim purity guard (docs/interfaces.md §1.2). Usage: node scripts/sim-purity.mjs [--strict] <dir>...
// Comments are stripped before matching, so doc comments may say "window", "Date" or "Math.sqrt" freely.
// Base patterns apply to every scanned file; with --strict (used for packages/sim/src) the numeric/locale bans apply too.
import fs from "node:fs";
import path from "node:path";

const BASE = [
  [/Math\.random/, "Math.random"],
  [/\bDate\b/, "Date (wall clock)"],
  [/performance\./, "performance.* (wall clock)"],
  [/\bsetTimeout\b/, "setTimeout"],
  [/\bsetInterval\b/, "setInterval"],
  [/\bwindow\b/, "window (DOM)"],
  [/\bdocument\b/, "document (DOM)"],
  [/from\s*["']three/, "import from three"],
  [/require\(\s*["']three/, "require three"],
];
const STRICT = [
  [
    /Math\.(pow|exp|expm1|log|log1p|log2|log10|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|sqrt|cbrt|hypot)\b/,
    "approximated Math.* (implementation-defined)",
  ],
  [/\*\*/, "** operator"],
  [/\blocaleCompare\b/, "localeCompare"],
  [/\bIntl\b/, "Intl"],
  [/\bstructuredClone\b/, "structuredClone (use deepClone)"],
];

/** Replace comments with spaces (newlines kept so line numbers survive). Understands strings, templates and regex literals. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const tpl = []; // brace depth stack for ${ } inside templates
  let depth = 0;
  let lastSig = ""; // last significant (non-space) char of code, to tell regex from division
  const blank = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === "/" && d === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      out += blank(src.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = c;
    } else if (c === "`") {
      let j = i + 1;
      while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{"))
        j += src[j] === "\\" ? 2 : 1;
      if (src[j] === "$") {
        out += src.slice(i, j + 2);
        tpl.push(depth);
        depth++;
        i = j + 2;
        lastSig = "{";
      } else {
        out += src.slice(i, j + 1);
        i = j + 1;
        lastSig = "`";
      }
    } else if (c === "}" && tpl.length > 0 && tpl[tpl.length - 1] === depth - 1) {
      // end of ${ } : resume template text
      tpl.pop();
      depth--;
      let j = i + 1;
      while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{"))
        j += src[j] === "\\" ? 2 : 1;
      if (src[j] === "$") {
        out += src.slice(i, j + 2);
        tpl.push(depth);
        depth++;
        i = j + 2;
        lastSig = "{";
      } else {
        out += src.slice(i, j + 1);
        i = j + 1;
        lastSig = "`";
      }
    } else if (c === "/" && (lastSig === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSig))) {
      // regex literal
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") j += 2;
        else if (src[j] === "[") {
          inClass = true;
          j++;
        } else if (src[j] === "]") {
          inClass = false;
          j++;
        } else if (src[j] === "/" && !inClass) break;
        else j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      lastSig = "/";
    } else {
      if (c === "{") depth++;
      if (c === "}") depth--;
      out += c;
      if (!/\s/.test(c)) lastSig = c;
      i++;
    }
  }
  return out;
}

export function scanSource(src, strict) {
  const text = stripComments(src);
  const rules = strict ? [...BASE, ...STRICT] : BASE;
  const hits = [];
  text.split("\n").forEach((line, idx) => {
    for (const [re, label] of rules)
      if (re.test(line)) hits.push({ line: idx + 1, label, text: line.trim() });
  });
  return hits;
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") yield* walk(p);
    } else if (p.endsWith(".ts")) yield p;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  let bad = 0;
  for (const dir of args.filter((a) => a !== "--strict")) {
    for (const file of walk(dir)) {
      for (const h of scanSource(fs.readFileSync(file, "utf8"), strict)) {
        console.log(`${file}:${h.line}: ${h.label}: ${h.text}`);
        bad++;
      }
    }
  }
  if (bad > 0) {
    console.log(`sim purity violations found: ${bad}`);
    process.exit(1);
  }
}
