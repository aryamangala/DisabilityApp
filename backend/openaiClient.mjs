import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Use gpt-4o for better quality EasyRead conversion
// Can be changed to "gpt-4o-mini" for lower cost/faster speed
const TEXT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.error("WARNING: OPENAI_API_KEY is not set in environment variables!");
}

// Helper function to sleep/delay
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Request queue to throttle API calls and prevent rate limits
class RequestQueue {
  constructor(maxConcurrent = 2, minDelay = 600) {
    this.queue = [];
    this.running = 0;
    this.maxConcurrent = maxConcurrent; // Max concurrent requests
    this.minDelay = minDelay; // Minimum delay between requests (ms)
    this.lastRequestTime = 0;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      await sleep(this.minDelay - timeSinceLastRequest);
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();
    this.lastRequestTime = Date.now();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      // Process next item in queue
      setTimeout(() => this.process(), 0);
    }
  }
}

// Global request queue for OpenAI API calls
const apiQueue = new RequestQueue(2, 600); // 2 concurrent, 600ms delay

// Retry function with exponential backoff for rate limits
async function callJsonModelWithRetry(systemPrompt, userContent, schemaDescription, maxRetries = 3) {
  const baseMessages = [
    {
      role: "system",
      content: systemPrompt + "\nYou must respond with valid JSON only."
    },
    {
      role: "user",
      content: userContent.includes("JSON") || userContent.includes("json")
        ? userContent
        : userContent + "\n\nRespond in valid JSON format."
    }
  ];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add a small delay between requests to avoid hitting rate limits
      if (attempt > 0) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(delay);
      }

      const response = await openai.chat.completions.create({
        model: TEXT_MODEL,
        messages: baseMessages,
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const raw = response.choices[0].message.content?.trim() || "";
      if (!raw) {
        throw new Error("Empty response from OpenAI");
      }

      try {
        return JSON.parse(raw);
      } catch (e) {
        console.warn("JSON parse failed, attempting repair:", e.message);
        const repairMessages = [
          {
            role: "system",
            content: "You are a JSON repair bot. Return valid JSON only."
          },
          {
            role: "user",
            content: `Fix this JSON and return only valid JSON: ${raw}`
          }
        ];

        const repairResp = await openai.chat.completions.create({
          model: TEXT_MODEL,
          messages: repairMessages,
          temperature: 0,
          response_format: { type: "json_object" }
        });
        const repaired = repairResp.choices[0].message.content?.trim() || "";
        if (!repaired) {
          throw new Error("Repair attempt returned empty response");
        }
        return JSON.parse(repaired);
      }
    } catch (apiErr) {
      const isRateLimit = apiErr.status === 429 || 
                         (apiErr.message && apiErr.message.includes("rate limit"));
      
      if (isRateLimit && attempt < maxRetries - 1) {
        // Extract retry-after from error message if available
        const retryMatch = apiErr.message?.match(/try again in (\d+)ms/i);
        const retryAfter = retryMatch ? parseInt(retryMatch[1]) : null;
        
        if (retryAfter) {
          console.log(`Rate limit hit. Waiting ${retryAfter}ms before retry...`);
          await sleep(retryAfter + 100); // Add small buffer
        }
        continue; // Retry
      }
      
      // If not a rate limit or out of retries, throw the error
      console.error("OpenAI API error:", apiErr);
      throw apiErr;
    }
  }
  
  throw new Error("Max retries exceeded");
}

async function callJsonModel(systemPrompt, userContent, schemaDescription) {
  // Use queue to throttle requests and prevent rate limits
  return apiQueue.enqueue(() => 
    callJsonModelWithRetry(systemPrompt, userContent, schemaDescription)
  );
}

export async function ocrImageToText(imageBase64, mimeType) {
  // Use queue for OCR requests to prevent rate limits
  return apiQueue.enqueue(async () => {
    const systemPrompt = "Extract all text from the image. Preserve line breaks and lists.";
    const userContent = [
      {
        type: "text",
        text: "Extract text."
      },
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`
        }
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0,
      max_tokens: 4000 // Limit response size for faster processing
    });

    const text = response.choices[0].message.content || "";
    return text.trim();
  });
}

export async function generateEasyRead(chunkText, language = "es") {
    // Force Spanish output regardless of input language.
    const outputLanguage = "es";
  
    const systemPrompt =
      "Eres un asistente de accesibilidad. Tu tarea es convertir documentos a formato Lectura Fácil (EasyRead) " +
      "para personas con discapacidad intelectual y dificultades cognitivas.\n\n" +
  
      "REGLA CRÍTICA:\n" +
      "- Tu salida debe estar SIEMPRE en español.\n" +
      "- Si el texto de entrada está en inglés u otro idioma, primero tradúcelo al español.\n" +
      "- Si el texto está mezclado (español e inglés), traduce las partes en inglés al español.\n\n" +
  
      "Objetivo:\n" +
      "- Mejorar la comprensión y la autonomía.\n" +
      "- Mantener el significado original.\n" +
      "- No eliminar obligaciones, fechas, montos, condiciones o consecuencias.\n" +
      "- No agregar información nueva, consejos u opiniones.\n\n" +
  
      "Reglas de Lectura Fácil (debes seguirlas estrictamente):\n" +
      "- Usa frases cortas (10 a 16 palabras).\n" +
      "- Una idea por frase.\n" +
      "- Usa palabras comunes y fáciles.\n" +
      "- Usa voz activa.\n" +
      "- No más de 5 viñetas en total (máximo 5 elementos en 'sentences').\n" +
      "- Evita jerga legal, tecnicismos, metáforas e ironías.\n" +
      "- Si aparece una palabra difícil, explíquela claramente.\n" +
      "- Mantén exactamente los números, fechas y cantidades.\n" +
      "- No expliques cada frase; explica solo lo conceptual e importante.\n\n" +
  
      "SALIDA REQUERIDA (SOLO JSON válido, sin markdown ni texto extra):\n" +
      "{\n" +
      '  "title": string,\n' +
      '  "sentences": string[],\n' +
      '  "keyTerms": { "term": string, "definition": string }[],\n' +
      '  "warnings": string[]\n' +
      "}\n" +
      "Reglas JSON:\n" +
      "- 'title' es obligatorio.\n" +
      "- 'sentences' es obligatorio y debe tener 1 a 5 frases.\n" +
      "- 'keyTerms' y 'warnings' deben ser arreglos (usa [] si no aplica).\n" +
      "- Devuelve SOLO JSON válido.";
  
    // Add a redundant Spanish-only directive here to resist any wrapper overrides.
    const userContent =
      "IMPORTANTE: Responde SOLO en español, aunque el texto esté en inglés.\n\n" +
      chunkText;
  
    return callJsonModel(systemPrompt, userContent, "Esquema JSON Lectura Fácil");
  }
// Quiz generation function removed - quiz functionality disabled

export async function isContentHighlySensitive(text) {
  const systemPrompt =
    "You classify if content is highly sensitive and should NOT be stored, " +
    "e.g., detailed self-harm instructions, child sexual abuse material, or explicit threats.\n" +
    "Respond with JSON: { \"highlySensitive\": boolean } only.";

  const schemaDescription = `{ "highlySensitive": boolean }`;

  const userContent =
    "Decide if this document is highly sensitive and should not be stored:\n\n" +
    text.slice(0, 6000);

  try {
    const result = await callJsonModel(
      systemPrompt,
      userContent,
      schemaDescription
    );
    return !!result.highlySensitive;
  } catch {
    return false;
  }
}

