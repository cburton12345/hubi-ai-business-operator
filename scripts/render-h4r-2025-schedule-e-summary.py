import json
import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def money(cents):
    return f"(${abs(cents) / 100:,.2f})" if cents < 0 else f"${cents / 100:,.2f}"


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#5B6570"))
    canvas.drawString(0.3 * inch, 0.14 * inch, "H4R 2025 Schedule E preparer worksheet")
    canvas.drawRightString(10.7 * inch, 0.14 * inch, "Page 1")
    canvas.restoreState()


if len(sys.argv) != 3:
    raise SystemExit("Usage: render-h4r-2025-schedule-e-summary.py input.json output.pdf")
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)
if data.get("version") != "h4r_2025_schedule_e_preparer_workpaper_v15":
    raise ValueError("Unexpected input version")
if data["totals"]["totalIncomeCents"] != 7168400 or data["totals"]["totalExpenseCents"] != 8405279 or data["totals"]["totalNetIncomeLossCents"] != -1236879:
    raise ValueError("Summary totals failed")
os.makedirs(os.path.dirname(os.path.abspath(sys.argv[2])), exist_ok=True)
styles = getSampleStyleSheet()
title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=colors.HexColor("#17324D"), alignment=0, spaceAfter=4)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.2, leading=8.6)
small = ParagraphStyle("Small", parent=body, fontSize=6.5, leading=7.3)
doc = SimpleDocTemplate(sys.argv[2], pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.27 * inch, bottomMargin=0.25 * inch, title="H4R 2025 Schedule E preparer worksheet")
story = [
    Paragraph("H4R 2025 Schedule E preparer worksheet", title),
    Paragraph(f"Rents received: <b>{money(data['totals']['totalIncomeCents'])}</b> &nbsp;&nbsp; Total expenses: <b>{money(data['totals']['totalExpenseCents'])}</b> &nbsp;&nbsp; Net income or (loss): <b>{money(data['totals']['totalNetIncomeLossCents'])}</b>", body),
    Spacer(1, 4),
]
rows = [["Property", "Rents received", "Total expenses", "Net income or (loss)"]]
for item in data["propertyTotals"]:
    rows.append([Paragraph(item["propertyName"], small), money(item["incomeCents"]), money(item["totalExpenseCents"]), money(item["netIncomeLossCents"])])
rows.append(["TOTAL", money(data["totals"]["totalIncomeCents"]), money(data["totals"]["totalExpenseCents"]), money(data["totals"]["totalNetIncomeLossCents"])])
table = Table(rows, colWidths=[5.0 * inch, 1.8 * inch, 1.8 * inch, 1.9 * inch], repeatRows=1)
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315A78")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF0F5")),
    ("LINEABOVE", (0, -1), (-1, -1), 1.1, colors.HexColor("#17324D")),
    ("FONTSIZE", (0, 0), (-1, -1), 7.2),
    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#B7C3CC")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F5F8FA")]),
    ("TOPPADDING", (0, 0), (-1, -1), 3.2),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
]))
story.extend([
    table,
    Spacer(1, 5),
    Paragraph("Losses are shown in parentheses. The attached Excel workbook groups every property expense into the 2025 Schedule E lines so the preparer can enter line 3 rents, lines 5-19 expenses, line 20 total expenses, and line 21 net income or loss. The preparer remains responsible for depreciation, property type and days, ownership, information-return requirements, return-level limitations, and final tax treatment.", small),
])
doc.build(story, onFirstPage=footer)
print(json.dumps({"pdf": sys.argv[2], "pagesExpected": 1, "properties": len(data["propertyTotals"]), "incomeCents": data["totals"]["totalIncomeCents"], "expenseCents": data["totals"]["totalExpenseCents"], "netCents": data["totals"]["totalNetIncomeLossCents"]}, indent=2))
