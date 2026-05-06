# Procedural Research Compiler Architecture

This document outlines the implementation of the 4-part deterministic pipeline.

## Part 1: The Translator (Input Processor)
- **Module:** `services/compiler/translator.js`
- **Function:** Parses natural language into a strict JSON schema.
- **Implementation:** Uses OpenRouter (GPT-4o-mini) with a forced JSON schema prompt to extract `core_task`, `entities` (with guessed domains), and `sub_questions`.

## Part 2: The Executor (Procedural Engine)
- **Module:** `services/compiler/executor.js`
- **Function:** Iterates through entities and sub-questions, executing searches.
- **Implementation:** 
  - Constructs queries `site:[domain] [task] [question]` or fallback if domain is unknown.
  - Calls Tavily API for search results.
  - Sorts results prioritizing URLs containing `pdf`, `policy`, `stra`, `planning`.
  - Enforces a strict 3-attempt limit per sub-question before marking "Data Deficient".

## Part 3: The Extractor (Verified Data Clerk)
- **Module:** `services/compiler/extractor.js`
- **Function:** Fetches URL content and extracts specific answers.
- **Implementation:**
  - Uses Jina Reader API to convert URLs to raw markdown.
  - Passes markdown to OpenRouter with a strict extraction prompt.
  - Checks for "NULL" responses to reject invalid sources.

## Part 4: The Synthesizer (Report Builder)
- **Module:** `services/compiler/synthesizer.js`
- **Function:** Formats accumulated data into a Markdown table.
- **Implementation:**
  - Consumes the in-memory array (`temp_research` equivalent).
  - Generates a GFM-compliant markdown table cross-referencing Entities with Sub-questions.

## State & Logging
- **State:** Managed in React components, simulating `temp_research.json` via state arrays.
- **Logging:** Captured via a custom `Logger` class, visible only in a hidden debug panel, keeping the main UI clean.