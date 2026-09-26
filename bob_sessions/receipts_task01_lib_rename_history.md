# Rename tools/_chk.mjs to tools/lib.mjs and tools/_chk.test.mjs to tools/lib.test.mjs. Then fix exactly three lines in tools/lib.test.mjs: line 21 import from './lib.mjs'; line 30 fixtures URL must be './fixtures/' (not '../../tools/fixtures/'); line 296 the filename list must be ['lib.mjs', 'lib.test.mjs']. Change nothing else. Verify with: node --test tools/lib.test.mjs — expect 13 pass, 0 fail.

---

**Status:** active  **Date:** 2026-09-26

---

### 👤 User

Rename tools/_chk.mjs to tools/lib.mjs and tools/_chk.test.mjs to tools/lib.test.mjs. Then fix exactly three lines in tools/lib.test.mjs: line 21 import from './lib.mjs'; line 30 fixtures URL must be './fixtures/' (not '../../tools/fixtures/'); line 296 the filename list must be ['lib.mjs', 'lib.test.mjs']. Change nothing else. Verify with: node --test tools/lib.test.mjs — expect 13 pass, 0 fail.

---

### 🤖 Assistant

> 🔧 called: read_file, read_file

Let me start by reading the current files to understand their content before making changes.

> 🔧 **read_file** — tools/_chk.test.mjs

> 🔧 **read_file** — tools/_chk.mjs

### 🤖 Assistant

> 🔧 called: execute_command

Now I have everything I need. Let me rename the files and make exactly the three targeted line changes.

> 🔧 **execute_command** — Move-Item tools/_chk.mjs tools/lib.mjs; Move-Item tools/_chk.test.mjs tools/lib.test.mjs

### 🤖 Assistant

> 🔧 called: apply_diff



> 🔧 **apply_diff** — tools/lib.test.mjs

### 🤖 Assistant

> 🔧 called: execute_command

Now verify with the test runner:

> 🔧 **execute_command** — node --test tools/lib.test.mjs 2>&1

### 🤖 Assistant

13 pass, 0 fail. Done.

**Summary of changes:**
1. Renamed `tools/_chk.mjs` → [`tools/lib.mjs`](tools/lib.mjs) and `tools/_chk.test.mjs` → [`tools/lib.test.mjs`](tools/lib.test.mjs)
2. [`lib.test.mjs:21`](tools/lib.test.mjs:21) — import changed from `'./_chk.mjs'` to `'./lib.mjs'`
3. [`lib.test.mjs:30`](tools/lib.test.mjs:30) — fixtures URL changed from `'../../tools/fixtures/'` to `'./fixtures/'`
4. [`lib.test.mjs:296`](tools/lib.test.mjs:296) — filename list updated to `['lib.mjs', 'lib.test.mjs']`