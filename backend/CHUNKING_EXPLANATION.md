# Document Chunking Explanation

## How Documents Are Chunked

The app uses intelligent chunking via the `chunkText()` function in `textUtils.mjs` to create meaningful, contextually-aware chunks.

### Chunking Strategy
- **Smart paragraph combination**: Combines small paragraphs to ensure substantial content per chunk
- **Minimum size**: 100 words per chunk (configurable)
- **Maximum size**: 300 words per chunk (configurable)
- **Contextual awareness**: Avoids splitting related content and handles headers/greetings intelligently

### Chunking Process

1. **Text Cleaning (Before Chunking)**
   - **Header/Footer Removal**: Removes repeated lines from first/last 20 lines
   - **Page Break Handling**: 
     - Replaces form feed characters (`\f`) with paragraph breaks
     - Removes page numbers (e.g., "Page 1", "- 1 -", "1 of 10")
     - Handles various page break markers
   - **Line Normalization**: 
     - Joins broken lines (lines ending with `-` for hyphenated words)
     - Preserves lists, headings, and special formatting
     - Merges lines that are part of the same paragraph

2. **Smart Paragraph Analysis**
   - Document is split by double newlines (`\n\n`) to identify paragraphs
   - Each paragraph is analyzed for:
     - Word count
     - Type (header, greeting, signature, list item, body text)
     - Contextual relationship to adjacent paragraphs

3. **Intelligent Chunking Logic**
   
   **Strategy 1: Standalone Elements**
   - Very short paragraphs (< 15 words) that are greetings, headers, or signatures
   - Automatically combined with the next paragraph
   - Examples: "Dear Participant", "Sincerely", "Best regards"
   
   **Strategy 2: Size-Based Combination**
   - Small paragraphs are combined until reaching minimum word count (100 words)
   - Prevents tiny chunks like "Dear Participant" from being standalone
   - Ensures each chunk has substantial content
   
   **Strategy 3: Maximum Size Management**
   - If adding a paragraph would exceed 300 words:
     - If current chunk is already substantial (≥100 words), start new chunk
     - If current chunk is too small, include the paragraph anyway to avoid fragmentation
   
   **Strategy 4: Long Paragraph Handling**
   - Very long paragraphs (>450 words) are split by sentences
   - Sentences are grouped to maintain 100-300 word chunks
   - Preserves readability while ensuring manageable sizes
   
   **Strategy 5: Final Optimization**
   - Final pass merges any remaining small chunks (<100 words) with adjacent chunks
   - Only merges if combined size is reasonable (≤360 words)

### Example

**Input text:**
```
Dear Participant,

This is paragraph one with about 50 words. It contains some important information that needs to be understood clearly.

This is paragraph two with about 50 words as well. It continues the discussion from the previous paragraph.

Thank you for your participation.
```

**Result**: 1 chunk
- Chunk 1: "Dear Participant,\n\nThis is paragraph one with about 50 words. It contains some important information that needs to be understood clearly.\n\nThis is paragraph two with about 50 words as well. It continues the discussion from the previous paragraph.\n\nThank you for your participation."
- The greeting and signature are combined with the body paragraphs to create a meaningful chunk

### Chunk Storage

- Each chunk is stored in the database with:
  - `chunkIndex`: Sequential number (0, 1, 2, ...)
  - `heading`: First sentence (up to 120 chars) as a preview
  - `originalText`: The full chunk text (combined paragraphs)
  - `unlocked`: All chunks are unlocked (no quiz requirement)
  - `completed`: Tracks if user has read the chunk

### Why This Approach?

1. **Meaningful chunks**: Each chunk contains substantial, contextually complete content
2. **Avoids fragmentation**: Prevents tiny chunks like "Dear Participant" from being standalone
3. **Contextual awareness**: Keeps related paragraphs together
4. **Optimal size**: 100-300 words is ideal for EasyRead conversion and user comprehension
5. **Smart handling**: Automatically handles greetings, headers, and signatures appropriately
6. **Page break handling**: Automatically merges paragraphs split across pages
