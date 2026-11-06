from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("QARegular", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("QABold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
from pypdf import PdfReader

out = Path(__file__).parent
cases = {
    'complete-two-page.pdf': [
        ['SYNTHETIC QA QUOTE - NOT A REAL OFFER', 'Example Installation Co. | QA-101',
         'Supply and install dishwasher TEST-DW100.', 'Parts CAD 600. Labour CAD 200.',
         'Subtotal CAD 800. HST CAD 104. Total CAD 904.',
         'Removal and disposal of the old dishwasher included.', 'Terms continue on page 2.'],
        ['SYNTHETIC QA QUOTE - QA-101 - TERMS',
         'Cabinet modifications excluded. No allowances.',
         'Start and finish: November 2, 2026. Quote expires October 25, 2026.',
         'Deposit CAD 100; balance CAD 804 after installation.',
         'Workmanship warranty: 12 months. Parts warranty: 24 months.']
    ],
    'conflicting-two-page.pdf': [
        ['SYNTHETIC QA QUOTE - NOT A REAL OFFER', 'Example Cabinet Co. | QA-202',
         'Replace two cabinet doors. Subtotal CAD 1000.',
         'Disposal allowance CAD 50. Taxes not specified.', 'See page 2 for total and conditions.'],
        ['SYNTHETIC QA QUOTE - QA-202 - CONTINUED', 'Total CAD 900.',
         'Extra cabinet work requires a revised quote.', 'Dates to be agreed.',
         'Warranty terms not provided.']
    ]
}
for name, pages in cases.items():
    pdf = canvas.Canvas(str(out / name), pagesize=letter, invariant=1)
    for index, lines in enumerate(pages):
        pdf.setFont('QABold', 14)
        pdf.drawString(48, 738, lines[0])
        pdf.setFont('QARegular', 11)
        for row, line in enumerate(lines[1:]):
            pdf.drawString(48, 690 - row * 32, line)
        pdf.drawString(48, 40, f'Page {index+1} of {len(pages)} | Synthetic test fixture')
        pdf.showPage()
    pdf.save()
    reader = PdfReader(out/name)
    assert len(reader.pages) == 2
    assert all(page.extract_text().strip() for page in reader.pages)
print('Two valid, two-page PDF fixtures created and text checked.')
