const fs = require("fs");
const path = require("path");
const srcDir = "e:/b2b-lead-generation-complete/B2BLeadOutReach/frontend/src";

function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) files = files.concat(walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

const files = walk(srcDir);
const patterns = {
  "hex-blue": /#1976d2|#1565c0|#42a5f5|#0288d1/,
  gradient: /linear-gradient/,
  "alpha()": / alpha\(/,
};

let allOk = true;
for (const f of files) {
  const rel = f.replace(
    "e:/b2b-lead-generation-complete/B2BLeadOutReach/frontend/src/",
    "",
  );
  const content = fs.readFileSync(f, "utf8");
  const lines = content.split("\n");
  const hits = {};
  for (const [name, rx] of Object.entries(patterns)) {
    const matched = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => rx.test(l));
    if (matched.length)
      hits[name] = matched.map(({ l, i }) => i + 1 + ": " + l.trim());
  }
  if (Object.keys(hits).length) {
    allOk = false;
    console.log("\n=== " + rel + " ===");
    for (const [k, v] of Object.entries(hits)) {
      console.log("  [" + k + "]");
      v.forEach((x) => console.log("    " + x));
    }
  }
}
if (allOk) console.log("ALL CLEAN - no forbidden patterns found");
