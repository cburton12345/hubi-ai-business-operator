import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#15243A")
BLUE = colors.HexColor("#1F6FEB")
LIGHT_BLUE = colors.HexColor("#EAF2FF")
LIGHT_GRAY = colors.HexColor("#F4F6F8")
MID_GRAY = colors.HexColor("#697386")
WARNING = colors.HexColor("#FFF4CE")
RED = colors.HexColor("#9B2C2C")


def money(cents):
    return f"${int(cents) / 100:,.2f}"


def clean(value, fallback=""):
    text = str(value or "").strip()
    return text if text else fallback


def month_key(row):
    value = clean(row.get("transaction_date"), "Unknown date")
    return value[:7] if len(value) >= 7 else "Unknown date"


def month_label(key):
    if key == "Unknown date":
        return key
    year, month = key.split("-")
    names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    return f"{names[int(month) - 1]} {year}"


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8),
        "subtitle": ParagraphStyle("subtitle", parent=base["BodyText"], fontName="Helvetica", fontSize=10, leading=14, textColor=MID_GRAY, spaceAfter=12),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=NAVY, spaceBefore=10, spaceAfter=7),
        "h3": ParagraphStyle("h3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=NAVY, spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=NAVY),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Helvetica", fontSize=6.5, leading=8, textColor=NAVY),
        "small_header": ParagraphStyle("small_header", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=6.5, leading=8, textColor=colors.white),
        "small_right": ParagraphStyle("small_right", parent=base["BodyText"], fontName="Helvetica", fontSize=6.5, leading=8, textColor=NAVY, alignment=TA_RIGHT),
        "warning": ParagraphStyle("warning", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=RED),
    }


def header_footer(title):
    def draw(canvas, document):
        canvas.saveState()
        width, height = landscape(letter)
        canvas.setStrokeColor(colors.HexColor("#D8DEE8"))
        canvas.line(0.35 * inch, height - 0.28 * inch, width - 0.35 * inch, height - 0.28 * inch)
        canvas.setFillColor(MID_GRAY)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(0.35 * inch, height - 0.21 * inch, title)
        canvas.drawRightString(width - 0.35 * inch, 0.2 * inch, f"Page {document.page}")
        canvas.restoreState()
    return draw


def summary_cards(items, style_map):
    cells = []
    for label, value in items:
        cells.append(Paragraph(f"<font color='#697386'>{label}</font><br/><font size='16'><b>{value}</b></font>", style_map["body"]))
    table = Table([cells], colWidths=[2.45 * inch] * len(cells), hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_BLUE),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#C9D9F2")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#C9D9F2")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def warning_box(text, style_map):
    table = Table([[Paragraph(text, style_map["warning"])]], colWidths=[10.25 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WARNING),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#D9A400")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def detail_table(rows, style_map, kind):
    if kind == "expense":
        headers = ["Date", "Source", "Description", "Category", "Location", "Assigned property", "Method", "Review bucket", "Amount"]
        widths = [0.65, 0.75, 2.35, 0.95, 0.75, 1.55, 0.80, 1.05, 0.75]
    else:
        headers = ["Date", "Source", "Description / source label", "Tenant candidate", "Review bucket", "Amount"]
        widths = [0.72, 0.88, 3.65, 2.00, 1.35, 0.95]
    data = [[Paragraph(header, style_map["small_header"]) for header in headers]]
    for row in rows:
        description = clean(row.get("merchant_name")) or clean(row.get("description"), "Description unavailable")
        location = ", ".join(filter(None, [clean(row.get("merchant_city")), clean(row.get("merchant_state"))])) or "Not identified"
        common = [
            Paragraph(clean(row.get("transaction_date"), "Unknown"), style_map["small"]),
            Paragraph(clean(row.get("source_file"), "Unknown"), style_map["small"]),
            Paragraph(description, style_map["small"]),
        ]
        if kind == "expense":
            values = common + [
                Paragraph(clean(row.get("suggested_category"), "Uncategorized"), style_map["small"]),
                Paragraph(location, style_map["small"]),
                Paragraph(clean(row.get("allocation_target_label"), "Unassigned"), style_map["small"]),
                Paragraph(clean(row.get("allocation_method"), "None").replace("_", " "), style_map["small"]),
                Paragraph(clean(row.get("review_bucket"), "needs review").replace("_", " "), style_map["small"]),
                Paragraph(money(row.get("amount_cents", 0)), style_map["small_right"]),
            ]
        else:
            values = common + [
                Paragraph(clean(row.get("tenant_match"), "No exact active-tenant match"), style_map["small"]),
                Paragraph(clean(row.get("review_bucket"), "needs review").replace("_", " "), style_map["small"]),
                Paragraph(money(row.get("amount_cents", 0)), style_map["small_right"]),
            ]
        data.append(values)
    table = Table(data, colWidths=[width * inch for width in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D8DEE8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
    ]))
    return table


def category_table(categories, style_map):
    rows = [[Paragraph("Provisional category", style_map["small_header"]), Paragraph("Rows", style_map["small_header"]), Paragraph("Amount", style_map["small_header"])]]
    rows.extend([
        [Paragraph(clean(item.get("category"), "Uncategorized"), style_map["small"]), Paragraph(str(item.get("count", 0)), style_map["small_right"]), Paragraph(money(item.get("amount_cents", 0)), style_map["small_right"])]
        for item in categories
    ])
    table = Table(rows, colWidths=[5.8 * inch, 1.1 * inch, 1.4 * inch], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D8DEE8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def compact_summary_table(headers, rows, widths, style_map, cell_padding=4):
    data = [[Paragraph(header, style_map["small_header"]) for header in headers]]
    data.extend([[Paragraph(clean(cell), style_map["small_right"] if index > 0 else style_map["small"]) for index, cell in enumerate(row)] for row in rows])
    table = Table(data, colWidths=[width * inch for width in widths], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D8DEE8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), cell_padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), cell_padding),
    ]))
    return table


def build_expense_pdf(data, output_path):
    s = styles()
    doc = SimpleDocTemplate(str(output_path), pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.42 * inch, bottomMargin=0.35 * inch, title="H4R 2025 Reviewed Expense Breakdown")
    story = [
        Paragraph("H4R 2025 reviewed expense breakdown", s["title"]),
        Paragraph("All twelve preserved Cash App statements, including May 2025. Transfers are excluded; ambiguous tax treatment remains plainly labeled.", s["subtitle"]),
        summary_cards([
            ("Expense rows", f"{data['counts']['expenses']:,}"),
            ("Candidate total", money(data["totals"]["expenseCents"])),
            ("Source coverage", "12 of 12 months"),
            ("Assigned to a property", f"{data['review']['expensesAssignedToProperty']:,}"),
        ], s),
        Spacer(1, 10),
        warning_box("Accountant/tax filing review is still required. Every outgoing non-transfer row has one owner-authorized proximity property assignment. An assignment is an editable bookkeeping allocation, not proof of business purpose or deductibility. General merchandise, likely personal items, and unresolved rows remain visibly separated.", s),
        Paragraph(f"Review split: {data['review']['categorizedExpenseCandidates']:,} categorized candidates; {data['review']['receiptAndBusinessPurposeNeeded']:,} need receipt/business purpose; {data['review']['likelyPersonalOrNonbusinessReview']:,} likely personal/nonbusiness review; {data['review']['categoryReviewNeeded']:,} need category-specific review; {data['review']['classificationNeeded']:,} still need classification.", s["body"]),
        PageBreak(),
        Paragraph("Provisional category summary", s["h2"]),
        category_table(data["categoryTotals"], s),
        PageBreak(),
        Paragraph("Review workload summary", s["title"]),
        compact_summary_table(
            ["Review bucket", "Rows", "Amount"],
            [[item["bucket"].replace("_", " "), f"{item['count']:,}", money(item["amount_cents"])] for item in data["reviewBucketTotals"]],
            [6.8, 1.0, 1.4], s,
        ),
        Paragraph("Top purchase locations", s["h2"]),
        Paragraph("The 20 largest location totals are shown here. Complete row-level location detail remains in the expense CSV and monthly appendix.", s["subtitle"]),
        compact_summary_table(
            ["City / state", "Rows", "Amount"],
            [[", ".join(filter(None, [item["city"], item["state"]])), f"{item['count']:,}", money(item["amount_cents"])] for item in data["expenseCityTotals"][:20]],
            [6.8, 1.0, 1.4], s,
        ),
        PageBreak(),
        Paragraph("Exclusive expense totals by assigned property", s["title"]),
        Paragraph("Every outgoing non-transfer row appears under exactly one property. Merchant-city, same-day route, and same-month activity methods are shown separately so approximate assignments remain reviewable.", s["subtitle"]),
        compact_summary_table(
            ["Assigned property", "Rows", "Direct", "Same day", "Same month", "Amount"],
            [[item["property_name"], f"{item['count']:,}", f"{item['direct_nearest']:,}", f"{item['same_day']:,}", f"{item['same_month']:,}", money(item["amount_cents"])] for item in data["propertyTotals"]],
            [5.1, 0.65, 0.65, 0.75, 0.8, 1.25], s,
        ),
        PageBreak(),
    ]
    grouped = defaultdict(list)
    for row in data["expenses"]:
        grouped[month_key(row)].append(row)
    for index, key in enumerate(sorted(grouped)):
        rows = grouped[key]
        story.append(Paragraph(f"{month_label(key)} - {len(rows):,} rows - {money(sum(int(row['amount_cents']) for row in rows))}", s["h2"]))
        story.append(detail_table(rows, s, "expense"))
        if index < len(grouped) - 1:
            story.append(PageBreak())
    doc.build(story, onFirstPage=header_footer("H4R 2025 - Reviewed expenses"), onLaterPages=header_footer("H4R 2025 - Reviewed expenses"))


def build_deposit_pdf(data, output_path):
    s = styles()
    doc = SimpleDocTemplate(str(output_path), pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.42 * inch, bottomMargin=0.35 * inch, title="H4R 2025 Reviewed Deposit and Transfer Breakdown")
    story = [
        Paragraph("H4R 2025 reviewed deposit breakdown", s["title"]),
        Paragraph("OCR-derived, project-scoped detail from all twelve preserved Cash App statements, including May 2025. Transfers are excluded from deposit totals and listed separately.", s["subtitle"]),
        summary_cards([
            ("Deposit rows", f"{data['counts']['deposits']:,}"),
            ("Deposit candidate total", money(data["totals"]["depositCents"])),
            ("Transfers separated", f"{data['counts']['transfers']:,}"),
            ("Transfer amount", money(data["totals"]["transferCents"])),
        ], s),
        Spacer(1, 10),
        warning_box(f"Ferocity found {data['review']['exactTenantNameCandidates']:,} exact active-tenant name candidates and left {data['review']['unmatchedDeposits']:,} deposits unmatched. A name match is not proof of rent, payment period, or ledger settlement; no H4R ledger was changed.", s),
        Paragraph(clean((data.get("historicalH4rEvidence") or {}).get("conclusion")), s["body"]),
        Paragraph("Deposit payer summary", s["h2"]),
        compact_summary_table(
            ["Payer / source", "Type", "Rows", "Months", "Total"],
            [[item["tenant_match"] or item["payer"], item["source_type"], f"{item['count']:,}", f"{len(item['months']):,}", money(item["amount_cents"])] for item in data["payerSummaries"]],
            [4.65, 2.15, 0.65, 0.65, 1.1], s,
        ),
        PageBreak(),
    ]
    grouped = defaultdict(list)
    for row in data["deposits"]:
        grouped[month_key(row)].append(row)
    for key in sorted(grouped):
        rows = grouped[key]
        story.append(Paragraph(f"{month_label(key)} - {len(rows):,} deposits - {money(sum(int(row['amount_cents']) for row in rows))}", s["h2"]))
        story.append(detail_table(rows, s, "deposit"))
        story.append(PageBreak())
    story.append(Paragraph("Transfers excluded from expense and deposit totals", s["title"]))
    story.append(Paragraph("These rows were identified as transfers and are listed separately to prevent double counting.", s["subtitle"])),
    story.append(detail_table(data["transfers"], s, "deposit"))
    doc.build(story, onFirstPage=header_footer("H4R 2025 - Deposits and transfers"), onLaterPages=header_footer("H4R 2025 - Deposits and transfers"))


def build_bank_transfer_pdf(data, output_path):
    s = styles()
    doc = SimpleDocTemplate(str(output_path), pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.42 * inch, bottomMargin=0.35 * inch, title="H4R 2025 Bank Transfer Property Allocation")
    story = [
        Paragraph("H4R 2025 bank-transfer property allocation", s["title"]),
        Paragraph("Separate cash-movement workpaper for the 21 transfers from Cash App to checking or the linked debit card. These transfers are not counted as expenses or additional income.", s["subtitle"]),
        summary_cards([
            ("Bank transfers", f"{data['sourceGuard']['transfers']:,}"),
            ("Transferred to bank/card", money(data["totals"]["bankTransferCents"])),
            ("Properties allocated", f"{len(data['propertyTotals']):,}"),
            ("Cash App payment basis", money(data["totals"]["cashAppPaymentAllocationBasisCents"])),
        ], s),
        Spacer(1, 10),
        warning_box("This schedule preserves 69 exact current-tenant-name deposit candidates, distributes unmatched person-to-person Cash App payments across all expense-bearing properties by expense share, and excludes merchant refunds. It is an owner-authorized bookkeeping estimate, not proof of 2025 tenancy, rent period, ledger settlement, or tax treatment.", s),
        Paragraph("Annual allocation by property", s["h2"]),
        compact_summary_table(
            ["Property", "Exact rows", "Exact deposits", "Estimated unmatched", "Expenses", "Transfer allocated"],
            [[item["propertyName"], f"{item['depositRows']:,}", money(item["exactDepositCents"]), money(item["estimatedUnmatchedPaymentCents"]), money(item["expenseCents"]), money(item["transferAllocatedCents"])] for item in data["propertyTotals"]],
            [4.1, 0.7, 1.05, 1.2, 1.05, 1.2], s, cell_padding=3,
        ),
        PageBreak(),
        Paragraph("Transfer-by-transfer allocation", s["title"]),
        Paragraph("Each transfer is split across all 20 expense-bearing properties and reconciles to the cent. The annual property totals above equal the sum of the allocated amounts below.", s["subtitle"]),
    ]
    grouped = defaultdict(list)
    for row in data["allocations"]:
        grouped[row["transferId"]].append(row)
    transfer_lookup = {row["id"]: row for row in data["transfers"]}
    ordered_ids = sorted(grouped, key=lambda item: (clean(transfer_lookup[item].get("transaction_date")), item))
    for transfer_id in ordered_ids:
        transfer = transfer_lookup[transfer_id]
        rows = grouped[transfer_id]
        allocation_table = compact_summary_table(
            ["Assigned property", "Allocated amount", "Exact deposits", "Estimated unmatched", "Combined basis"],
            [[row["propertyName"], money(row["allocatedCents"]), money(row["exactDepositCents"]), money(row["estimatedUnmatchedPaymentCents"]), money(row["basisDepositCents"])] for row in rows],
            [4.7, 1.1, 1.15, 1.25, 1.2], s,
        )
        story.append(KeepTogether([
            Paragraph(f"{clean(transfer.get('transaction_date'), 'Date unavailable')} - {money(transfer.get('amount_cents', 0))} - {clean(transfer.get('description'))}", s["h3"]),
            allocation_table,
            Spacer(1, 6),
        ]))
    doc.build(story, onFirstPage=header_footer("H4R 2025 - Bank-transfer allocation"), onLaterPages=header_footer("H4R 2025 - Bank-transfer allocation"))


def build_property_cash_summary_pdf(data, output_path):
    s = styles()
    doc = SimpleDocTemplate(str(output_path), pagesize=landscape(letter), rightMargin=0.35 * inch, leftMargin=0.35 * inch, topMargin=0.42 * inch, bottomMargin=0.35 * inch, title="H4R 2025 Property Tax-Preparer Summary")
    exact_total = int(data["totals"]["exactTenantCandidateDepositCents"])
    expense_total = sum(int(item["expenseCents"]) for item in data["propertyTotals"])
    transfer_total = int(data["totals"]["bankTransferCents"])
    rows = []
    for item in data["propertyTotals"]:
        rows.append([
            item["propertyName"],
            money(item["exactDepositCents"]),
            money(item["expenseCents"]),
        ])
    rows.append([
        "Portfolio total",
        money(exact_total),
        money(expense_total),
    ])
    story = [
        Paragraph("H4R 2025 property tax-preparer summary", s["title"]),
        Paragraph("Provisional tenant-name payment matches and assigned expense candidates by property. Start here; bank/card transfers and detailed transaction schedules remain separate.", s["subtitle"]),
        summary_cards([
            ("Provisional identified payments", money(exact_total)),
            ("Assigned expenses", money(expense_total)),
            ("Properties shown", f"{len(data['propertyTotals']):,}"),
            ("Transfers", "Separate reconciliation"),
        ], s),
        Spacer(1, 8),
        warning_box(f"This is a bookkeeping review schedule, not a final Schedule E. Unclassified incoming payments are excluded and are not represented as rent. Direct name matches remain provisional. The {money(transfer_total)} of bank/card transfers is excluded from this page and retained only in a separate reconciliation appendix; do not report it again as income or expense.", s),
        Paragraph("Property summary", s["h2"]),
        compact_summary_table(
            ["Property", "Provisional identified payments", "Assigned expense candidates"],
            rows,
            [7.0, 1.6, 1.6],
            s,
            cell_padding=2,
        ),
    ]
    doc.build(story, onFirstPage=header_footer("H4R 2025 - Property tax-preparer summary"), onLaterPages=header_footer("H4R 2025 - Property tax-preparer summary"))


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: render-h4r-2025-breakdown-pdfs.py INPUT_JSON TRANSFER_ALLOCATION_JSON OUTPUT_DIRECTORY")
    input_path = Path(sys.argv[1]).resolve()
    transfer_input_path = Path(sys.argv[2]).resolve()
    output_directory = Path(sys.argv[3]).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    data = json.loads(input_path.read_text(encoding="utf-8"))
    transfer_data = json.loads(transfer_input_path.read_text(encoding="utf-8"))
    expense_path = output_directory / "H4R-2025-printable-expense-breakdown.pdf"
    deposit_path = output_directory / "H4R-2025-printable-deposit-and-transfer-breakdown.pdf"
    bank_transfer_path = output_directory / "H4R-2025-printable-bank-transfer-property-allocation.pdf"
    property_cash_summary_path = output_directory / "H4R-2025-printable-property-cash-summary.pdf"
    if expense_path.exists() or deposit_path.exists() or bank_transfer_path.exists() or property_cash_summary_path.exists():
        raise FileExistsError("Refusing to overwrite an existing report PDF.")
    build_expense_pdf(data, expense_path)
    build_deposit_pdf(data, deposit_path)
    build_bank_transfer_pdf(transfer_data, bank_transfer_path)
    build_property_cash_summary_pdf(transfer_data, property_cash_summary_path)
    print(json.dumps({"expensePdf": str(expense_path), "depositPdf": str(deposit_path), "bankTransferPdf": str(bank_transfer_path), "propertyCashSummaryPdf": str(property_cash_summary_path)}, indent=2))


if __name__ == "__main__":
    main()
