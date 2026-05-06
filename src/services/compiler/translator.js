import { callLLM } from '../api';
import { systemLog } from '../logger';

/**
 * Self-healing semantic validation + auto-correction
 */
async function validateAndFixEntities(parsed, originalQuery) {
  const validationPrompt = `FIX research entity clustering AND ENFORCE BALANCE:
ORIGINAL QUERY: "${originalQuery}"
CURRENT: ${JSON.stringify(parsed)}

TASK:
1. Remove CONTEXT TERMS (AI/ML/tech) from entities → add to core_task
2. **ENFORCE 2-3 questions PER TARGET ENTITY** (no exceptions)
3. Re-generate missing sub-questions for thin entities
4. Every entity gets equal coverage

If perfect (2-3 questions per entity): {"valid": true}
Else: COMPLETE corrected JSON`;

  try {
    const fixResult = await callLLM(validationPrompt, "", true);
    const fixed = JSON.parse(fixResult);
    if (fixed.valid !== true) {
      systemLog.info("🔧 Auto-corrected entity clustering & balanced sub-questions", {
        before: parsed.entities?.length || 0,
        after: fixed.entities?.length || 0
      });
      return fixed;
    }
    return parsed;
  } catch (error) {
    systemLog.warn("Self-healing failed, using original extraction", error.message);
    return parsed;
  }
}

export async function translateQuery(query) {
  systemLog.info("PART 1: Translator (Semantic Clustering + Entity Isolation)");
  
  const systemPrompt = `You are a Semantic Research Planner. Decompose research queries into isolated target entities using clustering logic. 

PHASE 1 - SEMANTIC CLUSTERING:
1. Extract ALL candidate terms from the query.
2. Group by SIMILAR NATURE (industries, locations, companies form TARGET clusters).
3. ISOLATED TERMS (technologies, methods like AI/ML)=CONTEXT, not entities.
4. Only TARGET CLUSTER becomes the entities[] array.

PHASE 2 - PER-ENTITY SUB-QUESTIONS:
- Generate 2-3 focused sub-questions PER TARGET ENTITY.
- Each sub-question targets ONE entity + the research context.

REQUIRED JSON OUTPUT:
{"core_task": "Researching [CONTEXT] within specific sectors", "entities": [{"name": "Entity Name", "domain": "Optional", "synonyms": []}], "sub_questions": [{"entity": "Entity Name", "questions": ["Q1", "Q2"]}]}

CRITICAL: Return ONLY valid JSON.`;

  try {
    const result = await callLLM(systemPrompt, query, true);
    let parsed = JSON.parse(result);

    // AUTO-FIX & BALANCE: Apply self-healing layer
    parsed = await validateAndFixEntities(parsed, query);

    systemLog.info(`Research question: "${query}"`);
    systemLog.info(`Context identified: ${parsed.core_task}`);
    systemLog.info(
      `Entities found: ${parsed.entities.map(e => {
        const syns = e.synonyms?.length ? ` (also: ${e.synonyms.slice(0, 3).join(', ')})` : '';
        return e.name + syns;
      }).join(' | ')}`
    );
    for (const sq of parsed.sub_questions) {
      sq.questions.forEach((q, i) => {
        systemLog.info(`  [${sq.entity}] Q${i + 1}: ${q}`);
      });
    }

    // SUB-QUESTION BALANCE ENFORCEMENT
    const MIN_QUESTIONS_PER_ENTITY = 2;
    const entityQuestionCounts = (parsed.sub_questions || []).reduce((acc, sq) => {
      acc[sq.entity] = (sq.questions || []).length;
      return acc;
    }, {});

    const unbalanced = Object.entries(entityQuestionCounts).filter(([_, count]) => count < MIN_QUESTIONS_PER_ENTITY);

    if (unbalanced.length > 0) {
      systemLog.warn("⚠️ Unbalanced sub-questions detected", entityQuestionCounts);
      throw new Error(`Require ${MIN_QUESTIONS_PER_ENTITY}+ questions per entity. Unbalanced: ${unbalanced.map(([e, c]) => `${e}: ${c}`).join(', ')}`);
    }

    if (!parsed.entities || parsed.entities.length === 0) {
      throw new Error("No valid target entities extracted.");
    }

    return parsed;
  } catch (error) {
    systemLog.error("❌ Translator failed", { error: error.message, query });
    throw new Error(`Translator failed: ${error.message}`);
  }
}