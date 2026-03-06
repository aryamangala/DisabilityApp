const HEADER_FOOTER_MAX_LENGTH = 120;

export function removeHeadersFooters(text) {
  // Optimized: only check first/last 20 lines for headers/footers
  // This is much faster for large documents
  const lines = text.split(/\r?\n/);
  if (lines.length < 10) return text; // Skip for very short docs
  
  const counts = new Map();
  const checkLines = Math.min(20, Math.floor(lines.length / 4));
  
  // Only check first and last sections
  for (let i = 0; i < checkLines; i++) {
    const trimmed = lines[i]?.trim();
    if (trimmed && trimmed.length <= HEADER_FOOTER_MAX_LENGTH) {
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
  }
  for (let i = Math.max(0, lines.length - checkLines); i < lines.length; i++) {
    const trimmed = lines[i]?.trim();
    if (trimmed && trimmed.length <= HEADER_FOOTER_MAX_LENGTH) {
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
  }

  const repeated = new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= 2) // Lower threshold for faster detection
      .map(([line]) => line)
  );

  if (repeated.size === 0) return text; // Early exit if no headers/footers found

  return lines
    .filter((line) => !repeated.has(line.trim()))
    .join("\n");
}

export function normalizeLines(text) {
  // First, handle page breaks and form feeds
  // Replace form feeds and common page break markers with newlines
  let normalized = text
    .replace(/\f/g, '\n\n') // Form feed characters (common in PDFs)
    .replace(/\x0C/g, '\n\n') // Another form feed representation
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n');
  
  const lines = normalized.split(/\n/);

  const isListOrHeading = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(\d+\.|\-|\*|\•)\s+/.test(trimmed)) return true;
    if (/^#+\s+/.test(trimmed)) return true;
    if (/^[A-Z][A-Z0-9\s\-]{6,}$/.test(trimmed)) return true;
    return false;
  };

  // Detect page numbers (common at bottom of pages: "Page 1", "1", etc.)
  const isPageNumber = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Match patterns like "Page 1", "1", "- 1 -", "1 of 10", etc.
    return /^(Page\s+)?\d+(\s+of\s+\d+)?(\s*[-–—]\s*)?$/.test(trimmed) ||
           /^[-–—]\s*\d+\s*[-–—]$/.test(trimmed);
  };

  const out = [];
  let current = "";

  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };

  for (let line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and page numbers
    if (!trimmed || isPageNumber(trimmed)) {
      // If we have current text, don't flush on page numbers - they might be mid-paragraph
      // Only flush on truly empty lines
      if (!trimmed) {
        flush();
      }
      continue;
    }

    if (isListOrHeading(trimmed)) {
      flush();
      out.push(trimmed);
      continue;
    }

    // Join lines that are part of the same paragraph
    // Handle hyphenated words split across lines
    if (!current) {
      current = trimmed;
    } else {
      // If previous line ends with hyphen, join without space (hyphenated word)
      if (current.endsWith("-")) {
        current = current.slice(0, -1) + trimmed;
      } else {
        // Otherwise, join with space (continuation of paragraph)
        current += " " + trimmed;
      }
    }
  }
  flush();

  return out.join("\n\n");
}

export function chunkText(text, minWords = 100, maxWords = 300) {
  // Smart chunking: Combine paragraphs intelligently to ensure meaningful chunks
  // Split by double newlines (paragraph breaks)
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  // Helper to count words in text
  const countWords = (text) => {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  // Helper to check if paragraph is a header/greeting/signature (very short, likely standalone)
  const isStandaloneElement = (para) => {
    const words = countWords(para);
    const trimmed = para.trim();
    
    // Very short paragraphs (less than 10 words) that look like headers/greetings
    if (words < 10) {
      // Check for common patterns
      if (/^(Dear|Hello|Hi|To|From|Subject|Re:|RE:)/i.test(trimmed)) return true;
      if (/^(Sincerely|Best regards|Yours truly|Thank you|Regards,)/i.test(trimmed)) return true;
      if (/^[A-Z][A-Z\s]{5,}$/.test(trimmed)) return true; // ALL CAPS (likely header)
      if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(trimmed) && words <= 3) return true; // Name-like
      // Date patterns
      if (/^(Date|Dated|As of|Effective):?\s*\d/i.test(trimmed)) return true;
      // Address patterns (short lines that look like addresses)
      if (/^\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i.test(trimmed)) return true;
    }
    
    return false;
  };

  // Helper to check if paragraph is contextually related to next paragraph
  const isContextuallyRelated = (para1, para2) => {
    if (!para1 || !para2) return false;
    
    const p1 = para1.trim().toLowerCase();
    const p2 = para2.trim().toLowerCase();
    
    // Check for continuation indicators
    const continuationWords = ['this', 'these', 'it', 'they', 'he', 'she', 'we', 'you', 'that', 'such'];
    const p2FirstWords = p2.split(/\s+/).slice(0, 3).join(' ');
    
    // If next paragraph starts with a continuation word, likely related
    if (continuationWords.some(word => p2FirstWords.startsWith(word))) return true;
    
    // Check for question-answer patterns
    if (p1.endsWith('?') && !p2.startsWith('yes') && !p2.startsWith('no')) return true;
    
    // Check for list continuation (numbered or bulleted)
    if (isListItem(para1) && isListItem(para2)) return true;
    
    return false;
  };

  // Helper to check if paragraph is a list item
  const isListItem = (para) => {
    return /^(\d+\.|\-|\*|\•|\d+\))\s+/.test(para.trim());
  };

  const chunks = [];
  let currentChunk = [];
  let currentWordCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const wordCount = countWords(para);
    
    if (wordCount === 0) continue;

    const isStandalone = isStandaloneElement(para);
    const isList = isListItem(para);
    const nextPara = i + 1 < paragraphs.length ? paragraphs[i + 1] : null;
    const nextWordCount = nextPara ? countWords(nextPara) : 0;
    const nextIsStandalone = nextPara ? isStandaloneElement(nextPara) : false;

    // Strategy 1: Very short standalone elements (greetings, headers) - combine with next paragraph
    if (isStandalone && wordCount < 15 && nextPara && !nextIsStandalone) {
      // Combine with next paragraph
      currentChunk.push(para);
      currentWordCount += wordCount;
      continue; // Don't close chunk yet, wait for next paragraph
    }

    // Strategy 1.5: Contextually related paragraphs should stay together
    // If current chunk is small and next paragraph is contextually related, keep combining
    if (currentWordCount > 0 && currentWordCount < minWords && nextPara && 
        isContextuallyRelated(currentChunk[currentChunk.length - 1], nextPara) &&
        currentWordCount + wordCount + nextWordCount <= maxWords * 1.1) {
      // Add current paragraph and continue to next
      currentChunk.push(para);
      currentWordCount += wordCount;
      continue;
    }

    // Strategy 2: If adding this paragraph would exceed max, but current chunk is too small
    if (currentWordCount + wordCount > maxWords && currentWordCount < minWords) {
      // Current chunk is too small, but adding this would make it too large
      // Split the current paragraph if it's very long, otherwise include it
      if (wordCount > maxWords * 1.5) {
        // Very long paragraph - split by sentences
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.join("\n\n"));
          currentChunk = [];
          currentWordCount = 0;
        }
        
        // Split long paragraph by sentences
        const sentences = para.split(/(?<=[\.!\?])\s+/).filter(s => s.trim());
        let sentenceChunk = [];
        let sentenceWordCount = 0;
        
        for (const sent of sentences) {
          const sentWords = countWords(sent);
          if (sentenceWordCount + sentWords > maxWords && sentenceWordCount >= minWords) {
            chunks.push(sentenceChunk.join(" "));
            sentenceChunk = [sent];
            sentenceWordCount = sentWords;
          } else {
            sentenceChunk.push(sent);
            sentenceWordCount += sentWords;
          }
        }
        if (sentenceChunk.length > 0) {
          currentChunk = sentenceChunk;
          currentWordCount = sentenceWordCount;
        }
        continue;
      } else {
        // Include it anyway to avoid tiny chunks
        currentChunk.push(para);
        currentWordCount += wordCount;
        chunks.push(currentChunk.join("\n\n"));
        currentChunk = [];
        currentWordCount = 0;
        continue;
      }
    }

    // Strategy 3: Normal chunking - add paragraph to current chunk
    if (currentWordCount + wordCount <= maxWords) {
      currentChunk.push(para);
      currentWordCount += wordCount;
    } else {
      // Would exceed max - close current chunk and start new one
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n\n"));
      }
      currentChunk = [para];
      currentWordCount = wordCount;
    }

    // Strategy 4: If we've reached a good size and next paragraph is standalone, consider closing
    if (currentWordCount >= minWords && nextIsStandalone && nextWordCount < 10) {
      // Current chunk is good size, next is a small standalone - close current chunk
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [];
      currentWordCount = 0;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"));
  }

  // Final pass: Merge very small chunks with adjacent chunks
  const finalChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const wordCount = countWords(chunk);
    
    // If chunk is too small, try to merge with next chunk
    if (wordCount < minWords && i + 1 < chunks.length) {
      const nextChunk = chunks[i + 1];
      const nextWordCount = countWords(nextChunk);
      
      // Only merge if combined size is reasonable
      if (wordCount + nextWordCount <= maxWords * 1.2) {
        finalChunks.push(chunk + "\n\n" + nextChunk);
        i++; // Skip next chunk as we've merged it
        continue;
      }
    }
    
    finalChunks.push(chunk);
  }

  return finalChunks.filter((c) => c.trim().length > 0);
}

export function deriveHeading(chunkTextValue) {
  const firstPara = chunkTextValue.split(/\n{2,}/)[0] || chunkTextValue;
  const firstLine = firstPara.split(/\r?\n/)[0] || firstPara;
  const firstSentence = firstLine.split(/(?<=[\.!\?])\s+/)[0] || firstLine;
  return firstSentence.slice(0, 120);
}

