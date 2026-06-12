const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents
} = require('docx');
const fs = require('fs');

const C = {
  navy:       "1B3A6B",
  blue:       "2563EB",
  lightBlue:  "DBEAFE",
  teal:       "0D9488",
  lightTeal:  "CCFBF1",
  green:      "16A34A",
  lightGreen: "DCFCE7",
  amber:      "D97706",
  lightAmber: "FEF3C7",
  red:        "DC2626",
  lightRed:   "FEE2E2",
  gray:       "374151",
  lightGray:  "F3F4F6",
  midGray:    "E5E7EB",
  darkGray:   "111827",
  white:      "FFFFFF",
  border:     "D1D5DB",
};

const bdr = (color = C.border) => ({ style: BorderStyle.SINGLE, size: 1, color });
const noBdr = () => ({ style: BorderStyle.NONE, size: 0, color: C.white });
const allB = (color) => ({ top: bdr(color), bottom: bdr(color), left: bdr(color), right: bdr(color) });
const noB = () => ({ top: noBdr(), bottom: noBdr(), left: noBdr(), right: noBdr() });

function run(text, opts = {}) {
  return new TextRun({
    text, font: "Calibri",
    size: opts.size || 22,
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || C.darkGray,
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.navy, space: 4 } },
    children: [new TextRun({ text, font: "Calibri", size: 44, bold: true, color: C.navy })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, font: "Calibri", size: 32, bold: true, color: C.navy })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 80 },
    children: [new TextRun({ text, font: "Calibri", size: 26, bold: true, color: C.blue })],
  });
}
function h4(text) {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, font: "Calibri", size: 24, bold: true, color: C.gray })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 280 },
    children: [new TextRun({ text, font: "Calibri", size: opts.size || 22, color: opts.color || C.darkGray, italics: opts.italics || false })],
  });
}
function bullet(text, lv = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level: lv },
    spacing: { before: 60, after: 60, line: 276 },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: C.darkGray })],
  });
}
function gap(pts = 120) {
  return new Paragraph({ spacing: { before: 0, after: pts }, children: [new TextRun("")] });
}
function pb() {
  return new Paragraph({ children: [new TextRun({ break: 1 })] });
}
function divider(color = C.blue) {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color, space: 0 } },
    children: [new TextRun("")]
  });
}

function infoBox(title, lines, bg = C.lightBlue, bcolor = C.blue) {
  const kids = [
    new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: title, font: "Calibri", size: 24, bold: true, color: C.navy })] }),
    ...lines.map(l => new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: l, font: "Calibri", size: 21, color: C.gray })] }))
  ];
  return new Table({
    width: { size: 9026, type: WidthType.DXA }, columnWidths: [9026],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: bdr(bcolor), bottom: bdr(bcolor), left: { style: BorderStyle.SINGLE, size: 14, color: bcolor }, right: bdr(bcolor) },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      width: { size: 9026, type: WidthType.DXA },
      children: kids,
    })] })]
  });
}

function tbl(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          borders: allB(C.navy),
          shading: { fill: C.navy, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          width: { size: colWidths[i], type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: h, font: "Calibri", size: 20, bold: true, color: C.white })] })],
        }))
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => new TableCell({
          borders: allB(C.midGray),
          shading: { fill: ri % 2 === 0 ? C.white : C.lightGray, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          width: { size: colWidths[ci], type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: String(cell), font: "Calibri", size: 21, color: C.darkGray })] })],
        }))
      }))
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
      ]},
    ]
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 44, bold: true, font: "Calibri", color: C.navy }, paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Calibri", color: C.navy }, paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Calibri", color: C.blue }, paragraph: { spacing: { before: 220, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 } }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.navy, space: 4 } },
          spacing: { before: 0, after: 80 },
          children: [
            new TextRun({ text: "CLIPS — Marks OCR & Analytics Design", font: "Calibri", size: 18, color: C.gray }),
            new TextRun({ text: "   |   Page ", font: "Calibri", size: 18, color: C.gray }),
            new TextRun({ children: [PageNumber.CURRENT] }),
          ],
        })]
      })
    },
    children: [

// COVER
gap(1400),
new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
  children: [new TextRun({ text: "CLIPS", font: "Calibri", size: 110, bold: true, color: C.navy })] }),
new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
  children: [new TextRun({ text: "Student Management System", font: "Calibri", size: 34, color: C.blue })] }),
gap(100),
new Table({ width: { size: 5000, type: WidthType.DXA }, columnWidths: [5000],
  rows: [new TableRow({ children: [new TableCell({
    borders: noB(), shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 3, bottom: 3, left: 3, right: 3 },
    width: { size: 5000, type: WidthType.DXA },
    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun("")] })],
  })] })]
}),
gap(120),
new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
  children: [new TextRun({ text: "Marks Entry & Performance Analytics Module", font: "Calibri", size: 30, bold: true, color: C.navy })] }),
new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
  children: [new TextRun({ text: "Full System Design — Augmented Reality Scanner & Intelligence Matrix", font: "Calibri", size: 22, italics: true, color: C.gray })] }),
gap(500),
new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 60 },
  children: [new TextRun({ text: "Powered by: Next.js · Supabase · Google Cloud Vision API", font: "Calibri", size: 22, color: C.gray })] }),
pb(),

// EXEC SUMMARY
h1("1. Executive Summary"),
body("This document details the architectural and product design for the AI-powered Marks Entry and Performance Analytics Module. It replaces conventional data entry with an Augmented Reality (AR) styled scanning experience for teachers, backed by the Google Cloud Vision API. Furthermore, it strictly silos analytical insight (Z-Scores, Heatmaps, and Regression Trends) to an exclusive Administration Intelligence Matrix, preventing bias at the instructional level while giving leadership Bloomberg-Terminal-level visibility into academic health."),
gap(80),
infoBox("Four Core Architectural Pillars", [
  "1. Augmented Reality Capture — Teachers use a live, glowing HTML5 Canvas UI to frame and automatically capture handwritten marks.",
  "2. Google Cloud Vision OCR — Image payloads are processed by Google's DOCUMENT_TEXT_DETECTION model for high-accuracy handwriting extraction.",
  "3. Zero-Knowledge Instructional Layer — Teachers see only completion metrics. They cannot access class means, deviations, or comparative statistics.",
  "4. Admin Intelligence Matrix — Real-time PostgreSQL Window Functions generate Heatmaps, Z-Scores, and Teacher-Efficacy Matrices."
], C.lightBlue, C.blue),
gap(200),
pb(),

// TEACHER UX
h1("2. Teacher Portal: The Assessment Studio"),
body("The teacher experience is designed to feel fast, intelligent, and premium. Standard web forms are replaced by an 'Assessment Studio' optimized for mobile devices in the classroom."),
gap(80),

h2("2.1 The Augmented Reality (AR) Capture Interface"),
body("When a teacher taps 'Grade' next to a student, the browser requests camera access (navigator.mediaDevices). The UI transitions into a full-screen AR mode:"),
bullet("Live Viewfinder: The video feed fills the viewport with a blurred glassmorphic overlay focusing the eye on the center."),
bullet("Targeting Reticle: A dynamic, neon-green bounding box pulses. As the teacher aligns the exam paper, the UI simulates 'locking on' with subtle CSS haptics."),
bullet("Instant Capture: Tapping the screen freezes the frame with a shutter animation. The image is compressed to Base64 and shipped to the API."),
gap(100),

h2("2.2 The Google Cloud Vision OCR Pipeline"),
body("The backend (`/api/assessments/scan`) acts as a secure proxy to GCP."),
gap(80),
tbl(
  ["Pipeline Step", "Technical Execution"],
  [
    ["Payload Reception", "Express.js receives Base64 JPEG. Payload size enforced under 1MB."],
    ["GCP Authentication", "Service Account JSON securely stored in ENV variables authorizes the request."],
    ["Vision API Call", "Calls `vision.googleapis.com` using the `DOCUMENT_TEXT_DETECTION` model, optimized for dense handwritten text."],
    ["Heuristic Extraction", "Regex parsing of the `textAnnotations` array to isolate valid percentage formats (e.g., matching '87/100' and stripping noise)."],
  ],
  [2500, 6526]
),
gap(100),

h2("2.3 The Verification HUD (Human-in-the-Loop)"),
body("AI transcription is never saved automatically. The UI splits: the left shows the cropped, handwritten image. The right shows the glowing digital translation. The teacher must confirm or correct the value. This ensures 100% data integrity."),
gap(200),
pb(),

// ADMIN UX
h1("3. Admin Portal: Academic Intelligence Matrix"),
body("The admin dashboard is restricted. It relies on advanced SQL queries (`RANK() OVER`, `STDDEV()`) rather than client-side math, ensuring instantaneous rendering even across thousands of students."),
gap(80),

h2("3.1 Subject & Teacher Efficacy Heatmap"),
body("A dynamic grid visualization allowing the Admin to immediately spot performance trends."),
bullet("Rows represent individual Teachers (e.g., Agnes Walter, Mark Ochieng)."),
bullet("Columns represent Subjects across different Streams."),
bullet("Cells are color-coded based on the Standard Deviation from the school mean. Deep blue signifies high efficacy; crimson signifies intervention is required. This proves empirically if a specific teaching methodology is failing in a specific class."),
gap(100),

h2("3.2 The Deviation Waterfall & Z-Scores"),
body("Every student receives an automatic Z-Score tracking their distance from the class mean. The system clusters students into actionable cohorts:"),
gap(80),
tbl(
  ["Cohort Designation", "Z-Score Criteria", "Admin Recommended Action"],
  [
    ["Excelling / Gifted", "Z > +2.0", "Fast-track enrichment programming."],
    ["Stable Growth", "-1.0 < Z < +1.0", "Maintain current instructional trajectory."],
    ["At-Risk Warning", "Z < -1.5", "Flag for Head of Department review."],
    ["Critical Intervention", "Z < -2.0", "Immediate parent-teacher conference triggered."],
  ],
  [3000, 2500, 3526]
),
gap(100),

h2("3.3 Predictive Trajectory Engine"),
body("Using historical data from `reports`, the system plots a linear regression for each student. If a student is historically a 'Meeting Expectations' learner but their trajectory angle turns sharply negative across three assessments, the system generates a preemptive alert before they hit the 'Below Expectations' threshold."),

    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/peter/Desktop/stcharlse/CLIPS_Marks_Analytics_Design.docx", buffer);
  console.log("Implementation Plan DOCX generated successfully.");
});
