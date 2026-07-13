const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, PageBreak, Header, Footer,
  PageNumber, NumberFormat, SectionType, convertInchesToTwip
} = require('docx');

const SECTION_DEFS = [
  { key: 'executive_summary',       label: 'Executive Summary' },
  { key: 'organization_background', label: 'Organization Background' },
  { key: 'statement_of_need',       label: 'Statement of Need' },
  { key: 'goals_and_objectives',    label: 'Goals and Objectives' },
  { key: 'program_design',          label: 'Program Design and Methodology' },
  { key: 'evaluation_plan',         label: 'Evaluation Plan' },
  { key: 'sustainability_plan',     label: 'Sustainability Plan' },
  { key: 'budget_narrative',        label: 'Budget Narrative' }
];

// Legacy field fallbacks so older drafts still export
const FALLBACKS = {
  statement_of_need: 'problem_statement',
  goals_and_objectives: 'impact_statement'
};

function para(text, opts = {}) {
  if (!text) return null;
  return new Paragraph({
    alignment: opts.alignment || AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore ?? 0, after: opts.spaceAfter ?? 160, line: 340 },
    children: [
      new TextRun({
        text,
        size: opts.size ?? 24,
        font: 'Calibri',
        bold: opts.bold ?? false,
        color: opts.color ?? '000000'
      })
    ]
  });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1e3a5f', space: 4 } },
    children: [new TextRun({ text, font: 'Calibri', size: 32, bold: true, color: '1e3a5f' })]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, font: 'Calibri', size: 28, bold: true, color: '2c5282' })]
  });
}

function bodyParagraphs(text) {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map(line => {
    // Bullet lines (lines starting with •, -, *, or "Objective")
    const isBullet = /^[•\-*]/.test(line.trim()) || /^Objective\s*\d/i.test(line.trim());
    return new Paragraph({
      spacing: { before: 60, after: 120, line: 340 },
      indent: isBullet ? { left: convertInchesToTwip(0.3) } : undefined,
      children: [new TextRun({ text: isBullet ? line.trim().replace(/^[•\-*]\s*/, '• ') : line.trim(), font: 'Calibri', size: 24, color: '1a202c' })]
    });
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'e2e8f0', space: 6 } },
    children: []
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

/**
 * Build a professional DOCX proposal and return a Buffer.
 */
async function buildProposalDocx({ org, grant, draft, rfpAnalysis }) {
  const orgName = org?.name || 'Organization';
  const funderName = grant?.funder_name || rfpAnalysis?.funder_name || 'Funding Organization';
  const deadline = grant?.deadline ? new Date(grant.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  const amount = grant?.amount ? `$${Number(grant.amount).toLocaleString()}` : null;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Cover Page ──────────────────────────────────────────────────────────────
  const coverChildren = [
    new Paragraph({ spacing: { before: 2000, after: 0 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 240 },
      children: [new TextRun({ text: orgName.toUpperCase(), font: 'Calibri', size: 40, bold: true, color: '1e3a5f' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Grant Proposal', font: 'Calibri', size: 32, color: '2c5282' })]
    }),
    divider(),
    new Paragraph({ spacing: { before: 240, after: 80 }, alignment: AlignmentType.CENTER, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Submitted to', font: 'Calibri', size: 24, color: '718096' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 320 },
      children: [new TextRun({ text: funderName, font: 'Calibri', size: 28, bold: true, color: '1a202c' })]
    }),
    ...(deadline ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `Application Deadline: ${deadline}`, font: 'Calibri', size: 22, color: '4a5568' })]
    })] : []),
    ...(amount ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: `Amount Requested: ${amount}`, font: 'Calibri', size: 22, color: '4a5568' })]
    })] : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 320, after: 0 },
      children: [new TextRun({ text: `Prepared: ${today}`, font: 'Calibri', size: 20, color: '718096', italics: true })]
    }),
    pageBreak()
  ];

  // ── Contact / Cover Sheet ────────────────────────────────────────────────────
  const contactChildren = [];
  if (org) {
    contactChildren.push(heading1('Organization Information'));
    const rows = [
      ['Organization', org.name],
      ['EIN', org.ein],
      ['Address', [org.address?.street, org.address?.city, org.address?.state, org.address?.zip].filter(Boolean).join(', ')],
      ['Website', org.website],
      ['Phone', org.phone],
      ['Tax Status', org.taxExemptStatus],
      ['Years Operating', org.yearsInOperation],
      ['Annual Budget', org.annualBudget ? `$${Number(org.annualBudget).toLocaleString()}` : null]
    ].filter(([, v]) => v);
    rows.forEach(([label, value]) => {
      contactChildren.push(new Paragraph({
        spacing: { before: 40, after: 40, line: 300 },
        children: [
          new TextRun({ text: `${label}: `, font: 'Calibri', size: 22, bold: true }),
          new TextRun({ text: String(value), font: 'Calibri', size: 22 })
        ]
      }));
    });
    contactChildren.push(pageBreak());
  }

  // ── Proposal Body ─────────────────────────────────────────────────────────
  const bodyChildren = [];

  for (const { key, label } of SECTION_DEFS) {
    const text = draft[key] || (FALLBACKS[key] ? draft[FALLBACKS[key]] : null);
    if (!text || !text.trim()) continue;

    bodyChildren.push(heading1(label));
    bodyChildren.push(...bodyParagraphs(text));
    bodyChildren.push(divider());
    bodyChildren.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }));
  }

  // ── Assemble Doc ───────────────────────────────────────────────────────────
  const doc = new Document({
    numbering: { config: [] },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 24 },
          paragraph: { spacing: { line: 320 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1.25),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25)
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0', space: 4 } },
                children: [
                  new TextRun({ text: `${orgName}  |  Grant Proposal — ${funderName}`, font: 'Calibri', size: 18, color: '718096' })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', font: 'Calibri', size: 18, color: '718096' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 18, color: '718096' }),
                  new TextRun({ text: ' of ', font: 'Calibri', size: 18, color: '718096' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 18, color: '718096' })
                ]
              })
            ]
          })
        },
        children: [...coverChildren, ...contactChildren, ...bodyChildren]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildProposalDocx };
