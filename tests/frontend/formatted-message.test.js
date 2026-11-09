import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tokenizeInline,
  parseMarkdownBlocks,
} from "@/components/assistant/formatted-message";

describe("AI Assistant Formatted Message Parser (Markdown & Structure)", () => {
  it("tokenizes mixed inline bold, code, and currency amounts cleanly", () => {
    const input =
      "You are currently owed a total of **₹799.99** and **$25.00** across **3 pending invoices**.";
    const tokens = tokenizeInline(input);

    assert.ok(tokens.length >= 7);
    assert.equal(tokens[0].type, "text");
    assert.equal(tokens[0].value, "You are currently owed a total of ");
    assert.equal(tokens[1].type, "bold");
    assert.equal(tokens[1].value, "₹799.99");
    assert.equal(tokens[2].type, "text");
    assert.equal(tokens[2].value, " and ");
    assert.equal(tokens[3].type, "bold");
    assert.equal(tokens[3].value, "$25.00");
    assert.equal(tokens[4].type, "text");
    assert.equal(tokens[4].value, " across ");
    assert.equal(tokens[5].type, "bold");
    assert.equal(tokens[5].value, "3 pending invoices");
  });

  it("identifies monospace code tags for invoice references", () => {
    const input = "**Invoice:** `#b4417b64`";
    const tokens = tokenizeInline(input);

    assert.equal(tokens[0].type, "bold");
    assert.equal(tokens[0].value, "Invoice:");
    assert.equal(tokens[1].type, "text");
    assert.equal(tokens[2].type, "code");
    assert.equal(tokens[2].value, "#b4417b64");
  });

  it("handles markdown links and italic formatting", () => {
    const input = "Visit [PayPilot](https://paypilot.ai) for *fast* settlements.";
    const tokens = tokenizeInline(input);

    const linkToken = tokens.find((t) => t.type === "link");
    assert.ok(linkToken);
    assert.equal(linkToken.label, "PayPilot");
    assert.equal(linkToken.href, "https://paypilot.ai");

    const italicToken = tokens.find((t) => t.type === "italic");
    assert.ok(italicToken);
    assert.equal(italicToken.value, "fast");
  });

  it("parses the exact screenshot response into structured blocks and sub-items", () => {
    const screenshotText = `You are currently owed a total of **₹799.99** and **$25.00** across **3 pending invoices**.

Here is the breakdown of your outstanding payments:

1. **Client: Prasad**
 * **Amount:** ₹300.00 | **Invoice:** \`#b4417b64\` | **Due Date:** Nov 14, 2026
 * **Amount:** ₹499.99 | **Invoice:** \`#b00437a6\` | **Due Date:** Nov 21, 2026

2. **Client: Onkar**
 * **Amount:** $25.00 | **Invoice:** \`#db4bd263\` | **Due Date:** Nov 14, 2026

Currently, **0 invoices are overdue**. All pending payments are coming due later this month. Let me know if you would like help setting up payment reminders for these clients!`;

    const blocks = parseMarkdownBlocks(screenshotText);

    // Should have 5 distinct blocks:
    // 0: Paragraph (intro)
    // 1: Paragraph (breakdown lead-in)
    // 2: Numbered Group (Client: Prasad with 2 invoice sub-items)
    // 3: Numbered Group (Client: Onkar with 1 invoice sub-item)
    // 4: Paragraph (overdue summary & offer)
    assert.equal(blocks.length, 5);

    assert.equal(blocks[0].type, "paragraph");
    assert.match(blocks[0].text, /total of \*\*₹799.99\*\*/);

    assert.equal(blocks[1].type, "paragraph");
    assert.match(blocks[1].text, /breakdown of your outstanding payments/);

    assert.equal(blocks[2].type, "numbered-group");
    assert.equal(blocks[2].number, "1");
    assert.match(blocks[2].title, /Client: Prasad/);
    assert.equal(blocks[2].subItems.length, 2);
    assert.match(blocks[2].subItems[0], /b4417b64/);
    assert.match(blocks[2].subItems[1], /b00437a6/);

    assert.equal(blocks[3].type, "numbered-group");
    assert.equal(blocks[3].number, "2");
    assert.match(blocks[3].title, /Client: Onkar/);
    assert.equal(blocks[3].subItems.length, 1);
    assert.match(blocks[3].subItems[0], /db4bd263/);

    assert.equal(blocks[4].type, "paragraph");
    assert.match(blocks[4].text, /0 invoices are overdue/);
  });

  it("parses markdown tables with headers and rows correctly", () => {
    const tableText = `| Client | Invoice | Amount | Due Date |
| --- | --- | --- | --- |
| Prasad | #b4417b64 | ₹300.00 | Nov 14, 2026 |
| Onkar | #db4bd263 | $25.00 | Nov 14, 2026 |`;

    const blocks = parseMarkdownBlocks(tableText);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "table");
    assert.deepEqual(blocks[0].headers, ["Client", "Invoice", "Amount", "Due Date"]);
    assert.equal(blocks[0].rows.length, 2);
    assert.equal(blocks[0].rows[0][0], "Prasad");
    assert.equal(blocks[0].rows[0][1], "#b4417b64");
  });

  it("parses headers, blockquotes, and code fences cleanly", () => {
    const text = `### Receivables Summary
> Verified cashflow intelligence.

\`\`\`json
{ "status": "active" }
\`\`\`
---`;

    const blocks = parseMarkdownBlocks(text);
    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].level, 3);
    assert.equal(blocks[0].text, "Receivables Summary");

    assert.equal(blocks[1].type, "quote");
    assert.match(blocks[1].content, /Verified cashflow intelligence/);

    assert.equal(blocks[2].type, "code");
    assert.equal(blocks[2].language, "json");
    assert.match(blocks[2].code, /"status": "active"/);

    assert.equal(blocks[3].type, "divider");
  });
});
