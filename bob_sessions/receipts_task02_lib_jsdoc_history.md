# Add a JSDoc file header to tools/lib.mjs: one paragraph saying it joins IBM Bob task exports to git history to measure how many lines each Bob task wrote still survive, then a list of its exported functions with one line each. Do not change any code. Verify with: node --test tools/lib.test.mjs — still 13 pass.

---

**Status:** active  **Date:** 2026-09-26

---

### 👤 User

Add a JSDoc file header to tools/lib.mjs: one paragraph saying it joins IBM Bob task exports to git history to measure how many lines each Bob task wrote still survive, then a list of its exported functions with one line each. Do not change any code. Verify with: node --test tools/lib.test.mjs — still 13 pass.

---

### 🤖 Assistant

> 🔧 called: read_file

Let me read the file first to understand its structure and exported functions.

> 🔧 **read_file** — tools/lib.mjs

### 🤖 Assistant

> 🔧 called: read_file

Now let me check the test file to understand what's being tested:

> 🔧 **read_file** — tools/lib.test.mjs

### 🤖 Assistant

> 🔧 called: apply_diff

Now I have everything I need. The exported functions are: `WRITE_TOOLS`, `DEFAULT_WINDOW_MS`, `normalisePath`, `loadSessions`, `classifyTools`, `changedFiles`, `writtenFiles`, `bobAddedLines`, `git`, `commitLog`, `commitAddedLines`, `commitForTask`, `addedLines`, `survivingLines`, `survivingLineSet`, `taskSurvival`, `attributeTask`, `assertUniqueCommits`, `remediations`.

> 🔧 **apply_diff** — tools/lib.mjs

### 🤖 Assistant

> 🔧 called: execute_command

Now verify with the test suite:

> 🔧 **execute_command** — node --test tools/lib.test.mjs 2>&1

### 🤖 Assistant

13 pass, 0 fail. The JSDoc file header has been added to [`tools/lib.mjs`](tools/lib.mjs:1) — one opening paragraph describing the module's purpose, followed by a one-line entry for each of the 19 exported symbols.