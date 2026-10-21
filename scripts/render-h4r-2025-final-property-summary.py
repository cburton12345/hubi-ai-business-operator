import json
import os
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def money(cents):
    if cents < 0:
        return f"(${abs(cents) / 100:,.2f})"
    return f"${cents / 100:,.2f}"


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#5B6570"))
    canvas.drawString(0.35 * inch, 0.18 * inch, "H4R 2025 Cash App property workpaper - preparer review required")
    canvas.drawRightString(10.65 * inch, 0.18 * inch, "Page 1")
    canvas.restoreState()


if len(sys.argv) != 3:
    raise SystemExit("Usage: render-h4r-2025-final-property-summary.py input.json output.pdf")
input_path, output_path = sys.argv[1:]
with open(input_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)
if data.get("version") != "h4r_2025_final_property_workpaper_v11":
    raise ValueError("Unexpected input version")
if data["totals"]["allocatedIncomeCents"] != 7168400 or data["totals"]["allocatedExpenseCents"] != 8405279:
    raise ValueError("Certified totals failed")
if max(row["allocatedIncomeCents"] for row in data["propertyTotals"]) > 1200000:
    raise ValueError("Income concentration guard failed")
os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

styles = getSampleStyleSheet()
title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=colors.HexColor("#17324D"), alignment=TA_LEFT, spaceAfter=4)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=colors.HexColor("#222222"))
small = ParagraphStyle("Small", parent=body, fontSize=6.5, leading=7.5)
warn = ParagraphStyle("Warn", parent=body, fontName="Helvetica-Bold", textColor=colors.HexColor("#7F6000"), backColor=colors.HexColor("#FFF2CC"), borderPadding=5)
doc = SimpleDocTemplate(output_path, pagesize=landscape(letter), rightMargin=0.32 * inch, leftMargin=0.32 * inch, topMargin=0.28 * inch, bottomMargin=0.28 * inch, title="H4R 2025 Cash App property summary")

story = [
    Paragraph("H4R 2025 Cash App property summary", title),
    Paragraph(
        f"Allocated identified Cash App income: <b>{money(data['totals']['allocatedIncomeCents'])}</b> &nbsp;&nbsp; "
        f"Allocated outgoing non-transfer expenses: <b>{money(data['totals']['allocatedExpenseCents'])}</b> &nbsp;&nbsp; "
        f"Difference*: <b>{money(data['totals']['cashDifferenceCents'])}</b>", body),
    Spacer(1, 4),
]

table_data = [["Property", "Treatment", "Allocated income", "Allocated expenses", "Difference*", "Expense lines"]]
for row in data["propertyTotals"]:
    treatment = "Income + expenses" if row["role"] == "income_and_expense" else "Location expenses only"
    table_data.append([
        Paragraph(row["propertyName"], small),
        Paragraph(treatment, small),
        money(row["allocatedIncomeCents"]),
        money(row["allocatedExpenseCents"]),
        money(row["cashDifferenceCents"]),
        f"{row['expenseLineCount']:,}",
    ])
table_data.append(["TOTAL", "", money(data["totals"]["allocatedIncomeCents"]), money(data["totals"]["allocatedExpenseCents"]), money(data["totals"]["cashDifferenceCents"]), f"{len(data['allocationLines']):,}"])
table = Table(table_data, colWidths=[3.12 * inch, 1.62 * inch, 1.32 * inch, 1.32 * inch, 1.32 * inch, 0.92 * inch], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315A78")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 7),
    ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B7C3CC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F5F8FA")]),
    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF0F5")),
    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ("LINEABOVE", (0, -1), (-1, -1), 1.1, colors.HexColor("#17324D")),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story.extend([
    table,
    Spacer(1, 4),
    Paragraph(
        f"* Not tax profit. The separate unclassified incoming pool is {money(data['totals']['unclassifiedIncomingCents'])}; it is not allocated as confirmed rent here. "
        f"Bank/card transfers of {money(data['totals']['separateBankTransferCents'])} are reconciliation-only and are not counted as income or expenses.", warn),
    Spacer(1, 3),
    Paragraph(
        "Income method: 75% balanced across 13 owner-confirmed Cash App income properties and 25% influenced by eligible payer/property evidence, with Winkler limited and a $12,000 property cap. "
        "Expense method: equal sharing within the active region, or across all 13 active properties when location is unavailable. Martinsville and St Paul rows remain location-only exceptions. "
        "Dells and non-managed/inactive properties receive no shared allocation. Complete line-item detail and transaction reconciliation are in the Excel workbook and CSV files.", small),
])
doc.build(story, onFirstPage=footer)
print(json.dumps({"pdf": output_path, "pagesExpected": 1, "properties": len(data["propertyTotals"]), "incomeCents": data["totals"]["allocatedIncomeCents"], "expenseCents": data["totals"]["allocatedExpenseCents"]}, indent=2))
