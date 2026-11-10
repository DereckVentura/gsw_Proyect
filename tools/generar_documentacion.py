from pathlib import Path
from html import escape
import re, json, hashlib
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from reportlab.graphics import renderSVG, renderPDF

ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'documentacion'
OUT=ROOT/'entrega_2026-11-11'
OUT.mkdir(exist_ok=True)
FIG=DOC/'figuras';FIG.mkdir(exist_ok=True)
for n,f in [('Times','times.ttf'),('Times-Bold','timesbd.ttf'),('Times-Italic','timesi.ttf')]:
    pdfmetrics.registerFont(TTFont(n,str(Path('C:/Windows/Fonts')/f)))
pdfmetrics.registerFontFamily('Times',normal='Times',bold='Times-Bold',italic='Times-Italic',boldItalic='Times-Bold')
S={
 'title':ParagraphStyle('Title',fontName='Times-Bold',fontSize=20,leading=24,spaceAfter=16),
 'h1':ParagraphStyle('H1',fontName='Times-Bold',fontSize=16,leading=20,spaceAfter=12,keepWithNext=True),
 'h2':ParagraphStyle('H2',fontName='Times-Bold',fontSize=12.5,leading=16,spaceBefore=10,spaceAfter=7,keepWithNext=True),
 'body':ParagraphStyle('Body',fontName='Times',fontSize=11.2,leading=15.3,spaceAfter=8),
 'list':ParagraphStyle('List',fontName='Times',fontSize=11.2,leading=15.3,leftIndent=16,firstLineIndent=-13,spaceAfter=6),
 'cell':ParagraphStyle('Cell',fontName='Times',fontSize=9.3,leading=12),
 'head':ParagraphStyle('Head',fontName='Times-Bold',fontSize=9.3,leading=12),
}
NAVY=colors.HexColor('#163e67')

def box(d,x,y,w,h,title,small=''):
    d.add(Rect(x,y,w,h,rx=4,fillColor=colors.HexColor('#f5f7f9'),strokeColor=NAVY,strokeWidth=.8))
    d.add(String(x+w/2,y+h/2+(4 if small else -3),title,fontName='Times-Bold',fontSize=10,textAnchor='middle'))
    if small:d.add(String(x+w/2,y+h/2-9,small,fontName='Times',fontSize=8.5,textAnchor='middle'))

def arrow(d,x1,y1,x2,y2):
    d.add(Line(x1,y1,x2,y2,strokeColor=NAVY,strokeWidth=1))
    if x1==x2:d.add(Polygon([x2,y2,x2-3,y2+6,x2+3,y2+6],fillColor=NAVY,strokeColor=NAVY))
    else:
        sign=1 if x2>x1 else -1
        d.add(Polygon([x2,y2,x2-6*sign,y2+3,x2-6*sign,y2-3],fillColor=NAVY,strokeColor=NAVY))

def figure(kind):
    if kind=='arquitectura':
        d=Drawing(490,265)
        box(d,175,231,140,30,'Navegador')
        arrow(d,245,231,245,215)
        box(d,115,176,260,39,'Apache HTTPS','Interfaz React y proxy de API')
        d.add(String(383,191,'localhost:8443',fontName='Times',fontSize=8))
        arrow(d,245,176,245,159)
        box(d,150,122,190,37,'Nginx HTTPS','Balanceo round robin')
        d.add(String(348,135,'8443 interno / 8444 local',fontName='Times',fontSize=8))
        d.add(Line(70,107,420,107,strokeColor=NAVY));d.add(Line(245,122,245,107,strokeColor=NAVY))
        for x,n,p in [(5,'Nodo 1','19001'),(180,'Nodo 2','19002'),(355,'Nodo 3','19003')]:
            arrow(d,x+65,107,x+65,93)
            box(d,x,51,130,42,n,'Express y TypeScript')
            d.add(Line(x+65,51,x+65,37,strokeColor=NAVY))
            d.add(String(x+65,26,p+' local / 3000 interno',fontName='Times',fontSize=7.5,textAnchor='middle'))
        d.add(Line(70,37,420,37,strokeColor=NAVY));arrow(d,245,37,245,21)
        box(d,165,0,160,21,'MySQL 8.4 compartido')
    elif kind=='flujo_reserva':
        d=Drawing(490,150)
        steps=[('Consultar','flota y ficha'),('Ingresar','cuenta cliente'),('Cotizar','fechas y total'),('Confirmar','licencia y aceptación')]
        for i,(t,s) in enumerate(steps):
            x=i*124;box(d,x,90,112,44,t,s)
            if i<3:arrow(d,x+112,112,x+123,112)
        box(d,173,25,150,39,'Mis reservas','Revisar código y estado')
        d.add(Line(428,90,428,44,strokeColor=NAVY));arrow(d,428,44,323,44)
        d.add(String(2,4,'El servidor verifica la disponibilidad al confirmar.',fontName='Times',fontSize=8.3))
    else:
        d=Drawing(490,175)
        for x,y,w,t in [(5,121,130,'usuarios'),(180,121,130,'reservas'),(355,121,130,'vehiculos'),(5,31,130,'driver_documents'),(180,31,130,'alquileres'),(355,31,130,'ubicaciones')]:box(d,x,y,w,37,t)
        arrow(d,135,139,180,139);arrow(d,310,139,355,139)
        arrow(d,245,121,245,68);arrow(d,70,121,70,68);arrow(d,420,121,420,68)
        d.add(String(145,146,'1 a N',fontName='Times',fontSize=8));d.add(String(320,146,'N a 1',fontName='Times',fontSize=8))
        d.add(String(2,5,'Relaciones principales; el esquema completo está en database/migrations.',fontName='Times',fontSize=9))
    return d

for kind in ['arquitectura','flujo_reserva','modelo_datos']:
    renderSVG.drawToFile(figure(kind),str(FIG/(kind+'.svg')))
renderPDF.drawToFile(figure('arquitectura'),str(OUT/'Arquitectura_AutoRent.pdf'))

def inline(s):
    s=escape(s)
    s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'\1',s)
    return s.replace('→',' &gt; ')

def parse(path, chapter=False):
    lines=path.read_text(encoding='utf-8').splitlines();story=[];i=0
    while i<len(lines):
        s=lines[i].strip()
        if not s:i+=1;continue
        if s=='<!-- page -->':story.append(PageBreak());i+=1;continue
        if s.startswith('# '):
            text=s[2:]
            if chapter and path.name.startswith('00_'):text='Introducción y datos del proyecto'
            story.append(Paragraph(inline(text),S['h1' if chapter else 'title']));i+=1;continue
        if s.startswith('## '):story.append(Paragraph(inline(s[3:]),S['h2']));i+=1;continue
        if s.startswith('### '):story.append(Paragraph(inline(s[4:]),S['h2']));i+=1;continue
        if s.startswith('!['):
            kind=re.search(r'/([a-z_]+)\.svg',s).group(1)
            draw=figure(kind)
            if kind=='arquitectura':draw.scale(.9,.9);draw.width*=.9;draw.height*=.9
            story.extend([Spacer(1,5),draw,Spacer(1,12)]);i+=1;continue
        if s.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                raw=lines[i].strip()
                if not re.fullmatch(r'[| :\-]+',raw):rows.append([x.strip() for x in raw.strip('|').split('|')])
                i+=1
            n=len(rows[0]);w=A4[0]-98
            if n==2:widths=[158,w-158]
            elif rows[0][0] in ['ID','Caso']:widths=[43,218,w-261]
            else:widths=[125,165,w-290]
            data=[[Paragraph(inline(c),S['head' if j==0 else 'cell']) for c in row] for j,row in enumerate(rows)]
            tab=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
            tab.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9eef3')),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7)]))
            story.extend([tab,Spacer(1,10)]);continue
        style=S['list'] if re.match(r'^(\d+\. |- )',s) else S['body']
        if s.startswith('- '):s='• '+s[2:]
        story.append(Paragraph(inline(s),style));i+=1
    return story

def page(canvas,doc):
    if getattr(doc,'academic_cover',False) and doc.page==1:
        w,h=A4
        canvas.setFillColor(NAVY);canvas.rect(0,h-36,w,36,fill=1,stroke=0)
        canvas.setFillColor(colors.HexColor('#ffcc00'));canvas.rect(0,0,48,h-36,fill=1,stroke=0)
        canvas.drawImage(str(DOC/'logo_univo.png'),222,623,width=180,height=131,mask='auto')
        canvas.setFillColor(colors.black)
        center=322
        for y,t,b in [(594,'FACULTAD DE INGENIERÍA Y ARQUITECTURA',1),(571,'INGENIERÍA EN DESARROLLO DE SOFTWARE',1),(530,'Materia',1),(509,'Gestión de Servidores Web',0),(468,'Docente',1),(447,'Ing. Alberto Turcios Ortez',0),(403,'Responsables',1),(378,'Dereck Enrique Ventura Benítez',0),(354,'Andersson Wilfredo Vargas Reyes',0),(330,'Luis Román Lino Merino',0),(306,'Edwin David Díaz Acosta',0),(251,'Actividad',1),(227,'Documentación del proyecto AutoRent',0),(205,'Aplicación de alquiler y arquitectura de servidores',0),(155,'11 de noviembre de 2026',0)]:
            canvas.setFont('Times-Bold' if b else 'Times',12);canvas.drawCentredString(center,y,t)
        return
    canvas.setFillColor(colors.HexColor('#555555'));canvas.setFont('Times',8.5)
    canvas.drawString(49,A4[1]-26,'AutoRent · Gestión de Servidores Web · Versión 1.0')
    canvas.drawString(49,24,'Entrega del 11 de noviembre de 2026')
    canvas.drawRightString(A4[0]-49,24,str(doc.page))

class Book(SimpleDocTemplate):
    def afterFlowable(self,f):
        if isinstance(f,Paragraph) and f.style.name=='H1':
            text=f.getPlainText();key='s'+hashlib.sha1(text.encode()).hexdigest()
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text,key,0,False)
            self.notify('TOCEntry',(0,text,self.page,key))

def create_main():
    path=OUT/'Documentacion_integral_AutoRent.pdf'
    book=Book(str(path),pagesize=A4,leftMargin=49,rightMargin=49,topMargin=49,bottomMargin=46,title='Documentación integral de AutoRent',author='Equipo AutoRent')
    book.academic_cover=True
    story=[Spacer(1,700),PageBreak(),Paragraph('Índice',S['title'])]
    toc=TableOfContents();toc.levelStyles=[ParagraphStyle('TOC0',fontName='Times',fontSize=11,leading=21,leftIndent=0,firstLineIndent=0)]
    story.extend([toc,PageBreak()])
    for n,p in enumerate(sorted(DOC.glob('[0-9][0-9]_*.md'))):
        if n:story.append(PageBreak())
        story.extend(parse(p,True))
    act=DOC/'Acta_verificacion.md'
    if act.exists():story.extend([PageBreak()]+parse(act,True))
    book.multiBuild(story,onFirstPage=page,onLaterPages=page)
    print(path)

create_main()
for source,target in [('Manual_corto_reserva.md','Manual_corto_reserva.pdf'),('Guion_cuatro_personas.md','Guion_cuatro_personas.pdf')]:
    doc=Book(str(OUT/target),pagesize=A4,leftMargin=49,rightMargin=49,topMargin=49,bottomMargin=46,title=source.removesuffix('.md').replace('_',' '),author='Equipo AutoRent')
    doc.build(parse(DOC/source),onFirstPage=page,onLaterPages=page)
    print(OUT/target)
