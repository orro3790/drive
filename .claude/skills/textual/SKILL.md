---
name: textual
description: Required RAGnet documentation lookup before using the Textual library.
---

# Textual Documentation Lookup

Before writing or editing any Textual code, run a RAGnet search for the relevant API or pattern. The documentation lives in RAGnet; do not rely on memory.

## When to Use

- Any change that imports or references Textual
- Widgets, layouts, CSS, events, screens, app lifecycle, or composition
- Tests or examples that exercise Textual APIs

## Mandatory RAGnet Lookup

1. Run a focused query for the exact API or concept.
   - Use `ragnet-mcp_query` for specific terms (class name, event, method).
   - Use `ragnet-mcp_find_code_examples` for exact class/function names.
   - Use `ragnet-mcp_query_with_hyde` for conceptual questions (layout patterns, screen navigation, CSS).
2. If the top results are too shallow, call `ragnet-mcp_get_context_chain` to pull the full document.
3. Summarize the relevant constraints or usage rules in your response before coding.

## Execution Rule (Binding)

- Do not implement any Textual change until a RAGnet query has been run in the current session.
- If no relevant docs are found, stop and ask for direction instead of guessing.

## Output to User

- Mention the query you ran and cite the doc URL or source from RAGnet results.
- Then implement the change using the documented API.
