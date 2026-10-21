import json
import os
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak


def money(cents):
    return f"${cents / 100:,.2f}"


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#5B6570"))
    canvas.drawString(0.45 * inch, 0.25 * inch, "H4R 2025 balanced shared-expense workpaper - preparer review required")
    canvas.drawRightString(10.55 * inch, 0.25 * inch, f"Page {doc.page}")
    canvas.restoreState()


if len(sys.argv) != 3:
    raise SystemExit("Usage: render-h4r-2025-balanced-property-summary.py input.json output.pdf")

input_path, output_path = sys.argv[1:]
with open(input_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

if data.get("version") != "h4r_2025_balanced_shared_expense_v1":
    raise ValueError("Unexpected input version")
if data["sourceGuard"]["expenseRows"] != 1762 or data["totals"]["expenseCents"] != 8405279:
    raise ValueError("Source controls failed")
if any("elk mound" in row["propertyName"].lower() for row in data["propertyTotals"]):
    raise ValueError("Elk Mound must not appear")

os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
styles = getSampleStyleSheet()
title = ParagraphStyle("TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#17324D"), alignment=TA_LEFT, spaceAfter=10)
heading = ParagraphStyle("HeadingCustom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#17324D"), spaceBefore=6, spaceAfter=6)
body = ParagraphStyle("BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=colors.HexColor("#222222"), spaceAfter=6)
small = ParagraphStyle("SmallCustom", parent=body, fontSize=8, leading=10)
warning = ParagraphStyle("WarningCustom", parent=body, fontName="Helvetica-Bold", textColor=colors.HexColor("#7F6000"), backColor=colors.HexColor("#FFF2CC"), borderPadding=8, leading=13)

doc = SimpleDocTemplate(output_path, pagesize=landscape(letter), rightMargin=0.42 * inch, leftMargin=0.42 * inch, topMargin=0.42 * inch, bottomMargin=0.42 * inch, title="H4R 2025 balanced property expense workpaper")
story = [
    Paragraph("H4R 2025 balanced property expense workpaper", title),
    Paragraph("Readable primary schedule for owner and tax-preparer review", heading),
    Paragraph(
        f"The source contains <b>{data['sourceGuard']['expenseRows']:,} outgoing non-transfer transactions totaling {money(data['totals']['expenseCents'])}</b>. "
        f"The allocation uses <b>{data['sourceGuard']['propertyCount']} properties</b>. Elk Mound is excluded. Transfers are not included in the expense total.", body),
    Paragraph(
        "Important: this is a bookkeeping allocation estimate, not proof that a particular purchase belonged to a particular property and not a final Schedule E. "
        "A preparer still must review business purpose, deductibility, capitalization versus repair treatment, and whether each property was active during 2025.", warning),
    Spacer(1, 8),
    Paragraph("Allocation method", heading),
    Paragraph(
        "Purchases with a supported merchant city/state are shared across properties in that region. Purchases without usable location evidence are shared across the whole portfolio. "
        "Within each pool, 50% is divided equally and 50% follows provisional exact tenant-name payment evidence. That payment evidence is only a weighting input and is not represented as confirmed rent.", body),
    Paragraph("Certified controls", heading),
]

control_data = [
    ["Control", "Result"],
    ["Expense rows", f"{data['sourceGuard']['expenseRows']:,}"],
    ["Expense total", money(data["totals"]["expenseCents"])],
    ["Regional shared expenses", money(data["totals"]["regionalSharedExpenseCents"])],
    ["Portfolio shared expenses", money(data["totals"]["portfolioSharedExpenseCents"])],
    ["Properties", str(data["sourceGuard"]["propertyCount"])],
    ["Unbalanced transactions", "0"],
    ["Transfers included in expense total", "No"],
]
controls = Table(control_data, colWidths=[2.9 * inch, 2.0 * inch], repeatRows=1)
controls.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315A78")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#EAF0F5")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#AAB7C2")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("ROWBACKGROUNDS", (1, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
]))
story.extend([controls, Spacer(1, 10), Paragraph("Supporting files", heading), Paragraph("The Excel workbook provides the property summary and all 1,762 transaction reconciliation controls. Companion CSVs preserve the complete transaction-to-property split detail for electronic review. The original statement records remain the source evidence.", body), PageBreak()])

rows = data["propertyTotals"]
chunks = [rows[:13], rows[13:]]
for index, chunk in enumerate(chunks, start=1):
    story.append(Paragraph(f"Property expense schedule ({index} of 2)", title))
    table_data = [["Property", "City / State", "Region", "Payment evidence*", "Regional share", "Portfolio share", "Total expenses"]]
    for row in chunk:
        table_data.append([
            Paragraph(row["propertyName"], small),
            Paragraph(f"{row['city']}, {row['state']}", small),
            row["region"].replace("_", " ").upper(),
            money(row["provisionalIncomeCents"]),
            money(row["regionalSharedExpenseCents"]),
            money(row["portfolioSharedExpenseCents"]),
            money(row["totalExpenseCents"]),
        ])
    if index == 2:
        table_data.append(["TOTAL", "", "", money(data["totals"]["provisionalIdentifiedIncomeCents"]), money(data["totals"]["regionalSharedExpenseCents"]), money(data["totals"]["portfolioSharedExpenseCents"]), money(data["totals"]["expenseCents"])])
    table = Table(table_data, colWidths=[2.52 * inch, 1.15 * inch, 1.05 * inch, 1.15 * inch, 1.15 * inch, 1.15 * inch, 1.15 * inch], repeatRows=1, rowHeights=None)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315A78")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B7C3CC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if index == 2:
        style.extend([
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF0F5")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("LINEABOVE", (0, -1), (-1, -1), 1.2, colors.HexColor("#17324D")),
        ])
    table.setStyle(TableStyle(style))
    story.extend([table, Spacer(1, 8), Paragraph("* Provisional exact tenant-name payment evidence is shown only as a weighting reference. It is not confirmed rent and is not added to the expense total.", small)])
    if index == 1:
        story.append(PageBreak())

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(json.dumps({"pdf": output_path, "pagesExpected": 3, "properties": len(rows), "expenseCents": data["totals"]["expenseCents"]}, indent=2))
