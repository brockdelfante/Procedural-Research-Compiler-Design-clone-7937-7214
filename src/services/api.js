const OPENROUTER_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY;
const JINA_API_KEY = import.meta.env.VITE_JINA_API_KEY;

export async function callLLM(systemPrompt, userPrompt, jsonMode = false) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'ProceduralCompiler'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: jsonMode ? { type: "json_object" } : undefined,
      temperature: 0.1
    })
  });

  if (!response.ok) throw new Error(`LLM API Error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function searchTavily(query) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: query,
      search_depth: "basic",
      include_answer: false,
      max_results: 10
    })
  });

  if (!response.ok) throw new Error(`Tavily API Error: ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

export async function fetchWithJina(url) {
  const response = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) throw new Error(`Jina API Error: ${response.status}`);
  const text = await response.text();
  return text;
}