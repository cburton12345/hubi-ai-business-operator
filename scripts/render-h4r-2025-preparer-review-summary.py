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
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(colors.HexColor("#5B6570"))
    canvas.drawString(0.3 * inch, 0.14 * inch, "H4R 2025 Cash App workpaper - owner and tax-preparer review required")
    canvas.drawRightString(10.7 * inch, 0.14 * inch, "Page 1")
    canvas.restoreState()


if len(sys.argv) != 3:
    raise SystemExit("Usage: render-h4r-2025-preparer-review-summary.py input.json output.pdf")
input_path, output_path = sys.argv[1:]
with open(input_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)
if data.get("version") != "h4r_2025_worker_expense_workpaper_v13":
    raise ValueError("Unexpected input version")
if data["totals"]["estimatedCashAppIncomeCents"] != 7168400 or data["totals"]["candidateExpenseCents"] != 6322375 or data["totals"]["reviewExpenseCents"] != 2082904 or data["totals"]["confirmedWorkerPaymentCents"] != 738513 or data["totals"]["totalOutflowCents"] != 8405279:
    raise ValueError("Certified totals failed")
if any("dells" in row["propertyName"].lower() or "elk mound" in row["propertyName"].lower() for row in data["propertyTotals"]):
    raise ValueError("Excluded property appeared in summary")
os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

styles = getSampleStyleSheet()
title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=14.5, leading=16, textColor=colors.HexColor("#17324D"), alignment=TA_LEFT, spaceAfter=3)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=6.6, leading=7.8, textColor=colors.HexColor("#222222"))
small = ParagraphStyle("Small", parent=body, fontSize=6.1, leading=7)
warn = ParagraphStyle("Warn", parent=body, fontName="Helvetica-Bold", textColor=colors.HexColor("#7F6000"), backColor=colors.HexColor("#FFF2CC"), borderPadding=4)
doc = SimpleDocTemplate(output_path, pagesize=landscape(letter), rightMargin=0.25 * inch, leftMargin=0.25 * inch, topMargin=0.2 * inch, bottomMargin=0.22 * inch, title="H4R 2025 Cash App property summary")

story = [
    Paragraph("H4R 2025 Cash App property summary - preparer review", title),
    Paragraph(
        f"Estimated income: <b>{money(data['totals']['estimatedCashAppIncomeCents'])}</b> &nbsp;&nbsp; "
        f"Candidate rental and labor expenses: <b>{money(data['totals']['candidateExpenseCents'])}</b> &nbsp;&nbsp; "
        f"Tax treatment pending: <b>{money(data['totals']['reviewExpenseCents'])}</b> &nbsp;&nbsp; "
        f"Total outgoing cash: <b>{money(data['totals']['totalOutflowCents'])}</b>", body),
    Spacer(1, 3),
]

table_data = [["Property", "Treatment", "Estimated income", "Candidate rental + labor", "Tax treatment pending", "Total outgoing", "Income less candidate*"]]
for row in data["propertyTotals"]:
    treatment = "Income + expense" if row["role"] == "income_and_expense" else "Location expense only"
    table_data.append([
        Paragraph(row["propertyName"], small),
        Paragraph(treatment, small),
        money(row["estimatedCashAppIncomeCents"]),
        money(row["candidateExpenseCents"]),
        money(row["reviewExpenseCents"]),
        money(row["totalOutflowCents"]),
        money(row["candidateIncomeLessExpenseCents"]),
    ])
table_data.append(["TOTAL", "", money(data["totals"]["estimatedCashAppIncomeCents"]), money(data["totals"]["candidateExpenseCents"]), money(data["totals"]["reviewExpenseCents"]), money(data["totals"]["totalOutflowCents"]), money(data["totals"]["candidateIncomeLessExpenseCents"])])
table = Table(table_data, colWidths=[2.62 * inch, 1.23 * inch, 1.2 * inch, 1.27 * inch, 1.12 * inch, 1.16 * inch, 1.3 * inch], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315A78")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
    ("FONTSIZE", (0, 0), (-1, -1), 6.3),
    ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B7C3CC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F5F8FA")]),
    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF0F5")),
    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ("LINEABOVE", (0, -1), (-1, -1), 1.0, colors.HexColor("#17324D")),
    ("TOPPADDING", (0, 0), (-1, -1), 2.25),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 2.25),
]))
story.extend([
    table,
    Spacer(1, 3),
    Paragraph(
        f"* Not taxable profit or loss. The {money(data['totals']['confirmedWorkerPaymentCents'])} of named worker payments confirmed by the owner is included as labor/service expense candidates. "
        f"Items still pending tax treatment are not represented as deductible. Unmatched incoming of {money(data['totals']['unclassifiedIncomingCents'])} and bank/card transfers of {money(data['totals']['separateBankTransferCents'])} remain separate.", warn),
    Spacer(1, 2),
    Paragraph(
        "Expense method: merchant location selects the relevant active area. Within that area, 70% follows a common operating base and 30% follows estimated Cash App income, so higher-activity properties receive somewhat more without dominating a multi-property pool. Martinsville and St Paul remain location-only exceptions. The workbook contains the line-item detail plus editable expense and deposit decision lists.", small),
])
doc.build(story, onFirstPage=footer)
print(json.dumps({"pdf": output_path, "pagesExpected": 1, "properties": len(data["propertyTotals"]), "incomeCents": data["totals"]["estimatedCashAppIncomeCents"], "candidateExpenseCents": data["totals"]["candidateExpenseCents"], "reviewExpenseCents": data["totals"]["reviewExpenseCents"]}, indent=2))
