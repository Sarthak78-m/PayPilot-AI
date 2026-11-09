import React from "react";

/**
 * Tokenizes an inline string into formatted elements:
 * - `code` (monospace badge / invoice ID)
 * - **bold** (strong text)
 * - *italic* (em text)
 * - [label](url) (anchor link)
 * - plain text
 *
 * Guaranteed single-pass scan with zero regex backtracking risk.
 */
export function tokenizeInline(text) {
  if (!text || typeof text !== "string") return [];

  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 1. Code span: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({ type: "code", value: codeMatch[1] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold span: **bold** or __bold__
    const boldMatch = remaining.match(/^(\*\*|__)([^*_]+?)\1/);
    if (boldMatch) {
      tokens.push({ type: "bold", value: boldMatch[2] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Link span: [label](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (linkMatch) {
      tokens.push({ type: "link", label: linkMatch[1], href: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 4. Italic span: *italic* or _italic_ (not preceded or followed by matching marker)
    const italicMatch = remaining.match(/^(\*|_)([^*_]+?)\1/);
    if (italicMatch) {
      tokens.push({ type: "italic", value: italicMatch[2] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // 5. Plain text until the next special character
    const nextSpecial = remaining.search(/[`*_\[]/);
    if (nextSpecial === -1) {
      tokens.push({ type: "text", value: remaining });
      break;
    } else if (nextSpecial === 0) {
      // Unmatched single delimiter (e.g. lone asterisk or backtick)
      tokens.push({ type: "text", value: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      tokens.push({ type: "text", value: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return tokens;
}

/**
 * Renders inline tokens into styled React elements.
 */
export function renderInline(text, keyPrefix = "inline", isUser = false) {
  if (!text) return null;

  const tokens = tokenizeInline(text);

  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;

    if (token.type === "code") {
      const isInvoice = token.value.startsWith("#") || /^[a-f0-9-]{8,}$/i.test(token.value);
      return (
        <code
          key={key}
          className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold tracking-tight transition-colors ${
            isUser
              ? "bg-white/20 text-white border border-white/30"
              : isInvoice
              ? "bg-blue-500/10 text-[#2563EB] dark:text-[#60A5FA] border border-blue-500/25"
              : "bg-black/5 dark:bg-white/10 text-[#172033] dark:text-slate-200 border border-black/10 dark:border-white/10"
          }`}
        >
          {token.value}
        </code>
      );
    }

    if (token.type === "bold") {
      // Check if bold text itself contains code (e.g. **Invoice:**)
      return (
        <strong
          key={key}
          className={`font-bold ${
            isUser ? "text-white" : "text-[#0F172A] dark:text-white"
          }`}
        >
          {renderInline(token.value, `${key}-b`, isUser)}
        </strong>
      );
    }

    if (token.type === "italic") {
      return (
        <em
          key={key}
          className={`italic ${
            isUser ? "text-white/90" : "text-[#334155] dark:text-slate-300"
          }`}
        >
          {token.value}
        </em>
      );
    }

    if (token.type === "link") {
      return (
        <a
          key={key}
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            isUser
              ? "underline text-white font-medium hover:text-white/80"
              : "text-[#2563EB] dark:text-[#60A5FA] underline hover:text-[#1D4ED8] dark:hover:text-[#93C5FD]"
          }
        >
          {token.label}
        </a>
      );
    }

    return <span key={key}>{token.value}</span>;
  });
}

/**
 * Parses markdown text into high-level structural blocks:
 * - "code": Fenced code blocks (``` ... ```)
 * - "table": Markdown tables (| col | col |)
 * - "heading": Headers (#, ##, ###, ####)
 * - "divider": Horizontal rules (---, ***)
 * - "quote": Blockquotes (> ...)
 * - "numbered-group": Numbered lists with optional sub-items (e.g. Client + Invoices)
 * - "list": Unordered bullet lists (*, -, •)
 * - "paragraph": General prose paragraphs
 */
export function parseMarkdownBlocks(rawText) {
  if (!rawText || typeof rawText !== "string") return [];

  const text = rawText.trim().replace(/\r\n/g, "\n");
  if (!text) return [];

  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Skip completely empty lines between blocks
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Fenced Code Block: ```lang
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // Consume closing ```
      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // 3. Markdown Table: starts and ends with |
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const rawHeaders = tableLines[0]
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        // Second line is typically | --- | --- |
        const dataRows = tableLines.slice(2).map((rowLine) =>
          rowLine
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim())
        );

        blocks.push({
          type: "table",
          headers: rawHeaders,
          rows: dataRows,
        });
        continue;
      }
    }

    // 4. Horizontal Rule / Divider
    if (/^([-*_]){3,}$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    // 5. Headings: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 6. Blockquote: > ...
    if (trimmed.startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "quote",
        content: quoteLines.join("\n"),
      });
      continue;
    }

    // 7. Numbered Group / Item with potential sub-items (e.g. "1. **Client: Prasad**")
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const number = numberedMatch[1];
      const title = numberedMatch[2].trim();
      const subItems = [];
      i++;

      // Check subsequent lines for indented sub-bullets
      while (i < lines.length) {
        const nextLine = lines[i];
        const nextTrimmed = nextLine.trim();

        // If next line is a sub-bullet item (e.g. `* **Amount:** ...` or `- ...`)
        if (/^[*•-]\s+/.test(nextTrimmed)) {
          subItems.push(nextTrimmed.replace(/^[*•-]\s+/, ""));
          i++;
          continue;
        }

        // If line is indented spaces with content
        if (/^\s{2,}\S/.test(nextLine)) {
          subItems.push(nextTrimmed.replace(/^[*•-]\s+/, ""));
          i++;
          continue;
        }

        // Blank line lookahead: if next non-empty line is also a sub-bullet, keep consuming
        if (!nextTrimmed && i + 1 < lines.length) {
          const peekTrimmed = lines[i + 1].trim();
          if (/^[*•-]\s+/.test(peekTrimmed)) {
            i++; // skip empty line
            continue;
          }
        }

        break;
      }

      blocks.push({
        type: "numbered-group",
        number,
        title,
        subItems,
      });
      continue;
    }

    // 8. Bullet List Items: *, -, •
    if (/^[*•-]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[*•-]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[*•-]\s+/, ""));
        i++;
      }
      blocks.push({
        type: "list",
        items,
      });
      continue;
    }

    // 9. Standard Paragraph (consecutive non-empty, non-block lines)
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith(">") &&
      !/^([-*_]){3,}$/.test(lines[i].trim()) &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^(\d+)\.\s+/.test(lines[i].trim()) &&
      !/^[*•-]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paraLines.join(" "),
      });
    }
  }

  return blocks;
}

/**
 * FormattedMessage Component
 *
 * Renders structured markdown content into polished, accessible React elements
 * specifically tailored for PayPilot AI financial responses.
 */
export function FormattedMessage({ content, isUser = false, className = "" }) {
  if (!content) return null;

  const blocks = parseMarkdownBlocks(content);

  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((block, bIdx) => {
        const blockKey = `b-${bIdx}`;

        switch (block.type) {
          case "paragraph":
            return (
              <p
                key={blockKey}
                className={`text-xs sm:text-sm leading-relaxed ${
                  isUser ? "text-white" : "text-[#1E293B] dark:text-slate-200"
                }`}
              >
                {renderInline(block.text, blockKey, isUser)}
              </p>
            );

          case "numbered-group": {
            // Rendered as an executive client cardlet if it contains invoice sub-items
            const hasSubItems = block.subItems && block.subItems.length > 0;

            if (hasSubItems) {
              return (
                <div
                  key={blockKey}
                  className="p-3 sm:p-3.5 rounded-xl bg-white/75 dark:bg-white/[0.04] border border-[#CBD5E1]/70 dark:border-white/10 shadow-sm space-y-2.5 transition-all my-2"
                >
                  {/* Client Group Header */}
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-md bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm">
                      {block.number}
                    </span>
                    <span className="font-bold text-xs sm:text-sm text-[#0F172A] dark:text-white">
                      {renderInline(block.title, `${blockKey}-title`, isUser)}
                    </span>
                  </div>

                  {/* Sub-item invoice rows */}
                  <div className="space-y-1.5 pl-0.5 sm:pl-1">
                    {block.subItems.map((sub, sIdx) => {
                      const hasPipes = sub.includes("|");
                      const subKey = `${blockKey}-sub-${sIdx}`;

                      if (hasPipes) {
                        const parts = sub.split("|").map((p) => p.trim());
                        return (
                          <div
                            key={subKey}
                            className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-xs py-1.5 px-2.5 rounded-lg bg-[#F1F5F9]/90 dark:bg-black/20 border border-[#E2E8F0] dark:border-white/5"
                          >
                            {parts.map((part, pIdx) => (
                              <React.Fragment key={pIdx}>
                                {pIdx > 0 && (
                                  <span
                                    className="text-[#94A3B8] select-none text-[10px] hidden sm:inline"
                                    aria-hidden="true"
                                  >
                                    •
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  {renderInline(part, `${subKey}-p${pIdx}`, isUser)}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={subKey}
                          className="flex items-start gap-2 text-xs text-[#334155] dark:text-slate-300"
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[#2563EB] mt-1.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="flex-1 leading-relaxed">
                            {renderInline(sub, subKey, isUser)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Simple numbered list item
            return (
              <div key={blockKey} className="flex items-start gap-2.5 text-xs sm:text-sm my-1">
                <span className="h-5 w-5 rounded-md bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  {block.number}
                </span>
                <div className="flex-1 leading-relaxed text-[#1E293B] dark:text-slate-200">
                  {renderInline(block.title, blockKey, isUser)}
                </div>
              </div>
            );
          }

          case "list":
            return (
              <ul key={blockKey} className="space-y-1.5 my-2">
                {block.items.map((item, idx) => {
                  const hasPipes = item.includes("|");
                  const itemKey = `${blockKey}-li-${idx}`;

                  if (hasPipes) {
                    const parts = item.split("|").map((p) => p.trim());
                    return (
                      <li
                        key={itemKey}
                        className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-xs py-1.5 px-2.5 rounded-lg bg-[#F1F5F9]/90 dark:bg-black/20 border border-[#E2E8F0] dark:border-white/5"
                      >
                        {parts.map((part, pIdx) => (
                          <React.Fragment key={pIdx}>
                            {pIdx > 0 && (
                              <span
                                className="text-[#94A3B8] select-none text-[10px] hidden sm:inline"
                                aria-hidden="true"
                              >
                                •
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              {renderInline(part, `${itemKey}-p${pIdx}`, isUser)}
                            </span>
                          </React.Fragment>
                        ))}
                      </li>
                    );
                  }

                  return (
                    <li
                      key={itemKey}
                      className={`flex items-start gap-2 text-xs sm:text-sm ${
                        isUser ? "text-white" : "text-[#1E293B] dark:text-slate-200"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full mt-2 shrink-0 ${
                          isUser ? "bg-white" : "bg-[#2563EB]"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 leading-relaxed">
                        {renderInline(item, itemKey, isUser)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            );

          case "heading": {
            const headingClasses = {
              1: "text-base sm:text-lg font-extrabold mt-3 mb-1.5 tracking-tight",
              2: "text-sm sm:text-base font-bold mt-2.5 mb-1 tracking-tight",
              3: "text-xs sm:text-sm font-bold mt-2 mb-0.5 tracking-tight",
              4: "text-xs font-bold mt-1.5 mb-0.5 uppercase tracking-wider",
            };
            return (
              <h4
                key={blockKey}
                className={`${headingClasses[block.level] || headingClasses[3]} ${
                  isUser ? "text-white" : "text-[#0F172A] dark:text-white"
                }`}
              >
                {renderInline(block.text, blockKey, isUser)}
              </h4>
            );
          }

          case "table":
            return (
              <div
                key={blockKey}
                className="overflow-x-auto my-2 rounded-xl border border-[#CBD5E1] dark:border-white/10 shadow-sm"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#E2E8F0]/80 dark:bg-white/5 border-b border-[#CBD5E1] dark:border-white/10">
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="py-2 px-3 font-bold text-[#0F172A] dark:text-white uppercase tracking-wider text-[11px]"
                        >
                          {renderInline(h, `${blockKey}-th-${hIdx}`, isUser)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-white/5 bg-white/50 dark:bg-transparent">
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-blue-500/5 transition-colors"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-2 px-3 text-[#334155] dark:text-slate-200"
                          >
                            {renderInline(cell, `${blockKey}-r${rIdx}-c${cIdx}`, isUser)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "code":
            return (
              <div
                key={blockKey}
                className="my-2 rounded-xl overflow-hidden border border-slate-700/60 shadow-md"
              >
                {block.language && (
                  <div className="bg-slate-800 text-slate-300 text-[10px] font-mono px-3 py-1 font-semibold uppercase tracking-wider border-b border-slate-700">
                    {block.language}
                  </div>
                )}
                <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                  <code>{block.code}</code>
                </pre>
              </div>
            );

          case "quote":
            return (
              <blockquote
                key={blockKey}
                className="border-l-4 border-[#2563EB] pl-3 py-1.5 my-2 bg-blue-500/5 dark:bg-blue-500/10 text-xs sm:text-sm italic text-[#334155] dark:text-slate-300 rounded-r-lg"
              >
                {renderInline(block.content, blockKey, isUser)}
              </blockquote>
            );

          case "divider":
            return (
              <hr
                key={blockKey}
                className="my-3 border-t border-[#CBD5E1]/80 dark:border-white/10"
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

export default FormattedMessage;
