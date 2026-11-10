from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
import ssl,json,uuid,time,subprocess,base64,statistics,os

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidencias';OUT.mkdir(exist_ok=True)
CTX=ssl.create_default_context(cafile=str(ROOT/'.local/certs/localhost.crt'))
BASE='https://localhost:8443'
DOCKER=Path(os.environ['LOCALAPPDATA'])/'Programs/DockerDesktop/resources/bin/docker.exe'
checks=[]
def check(name,ok,detail=''):
    checks.append({'prueba':name,'resultado':'APROBADA' if ok else 'FALLIDA','detalle':detail})
def call(path,method='GET',data=None,token=None,key=None,base=BASE):
    headers={}
    if data is not None:headers['Content-Type']='application/json'
    if token:headers['Authorization']='Bearer '+token
    if key:headers['Idempotency-Key']=key
    req=Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
    try:r=urlopen(req,context=CTX,timeout=15)
    except HTTPError as e:r=e
    content=r.read();body=json.loads(content) if 'json' in r.headers.get('Content-Type','') else content.decode('utf-8',errors='replace')
    return r.status,body,r.headers.get('X-AutoRent-Node')
def dc(*args):
    r=subprocess.run([str(DOCKER),'compose',*args],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
    if r.returncode:raise RuntimeError('Error de Compose: '+r.stderr[-300:])
    return r.stdout

reservation_id=None;token=None;recovered=False
try:
    status,body,_=call('/')
    check('HTTPS Apache e interfaz',status==200 and 'AutoRent' in body,'Certificado y nombre verificados; respuesta 200')
    for i in range(1,4):
        status,body,node=call('/health',base='http://127.0.0.1:'+str(19000+i))
        check('Salud nodo'+str(i),status==200 and body.get('nodo')=='nodo'+str(i) and node=='nodo'+str(i),'MySQL conectado e identidad presente')
    nodes=[]
    for _ in range(12):
        status,b,node=call('/health',base='https://localhost:8444');nodes.append(node)
        if status!=200:raise RuntimeError('Balanceador devolvió '+str(status))
    check('Balanceo por HTTPS',set(nodes)=={'nodo1','nodo2','nodo3'},'12 respuestas; nodos '+', '.join(sorted(set(nodes))))
    status,b,_=call('/api/v1/vehicles');cars=b['data']['vehicles']
    check('Catálogo dinámico',status==200 and len(cars)==3,'Tres unidades desde MySQL')
    status,_,_=call('/api/v1/admin/vehicles');check('Administración sin sesión',status==401,'Rechazo 401')
    status,_,_=call('/api/v1/vehicles?marca_id=1%20OR%201=1');check('Filtro manipulado',status==400,'Rechazo 400')
    status,c,_=call('/api/v1/content');acceptance={'version':c['data']['version'],'privacidad':True,'terminos':True}
    email='gsw-'+uuid.uuid4().hex[:12]+'@example.test';password='Prueba_GSW_'+uuid.uuid4().hex
    register={'nombres':'Cliente','apellidos':'Prueba GSW','email':email,'password':password,'aceptacion':acceptance}
    status,_,_=call('/api/v1/auth/register','POST',register);check('Registro de cliente ficticio',status==201,'Cuenta exclusiva de laboratorio')
    status,login,_=call('/api/v1/auth/login','POST',{'email':email,'password':password});token=login['data']['accessToken']
    check('Acceso autenticado',status==200,'Token no incluido en la evidencia')
    now=datetime.now(timezone.utc)+timedelta(days=45)
    inicio=now.replace(microsecond=0).isoformat();fin=(now+timedelta(days=2)).replace(microsecond=0).isoformat()
    source={'vehiculo_id':cars[0]['id'],'inicio':inicio,'fin':fin,'entrega_id':1,'devolucion_id':1}
    status,q,_=call('/api/v1/reservations/quote','POST',source,token);check('Cotización',status==200,'Precio calculado en el servidor')
    image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
    status,d,_=call('/api/v1/driver-documents','POST',{'titular':'Cliente de Prueba GSW','pais':'El Salvador','vencimiento':'2028-12-31','frente':image,'reverso':image,'consentimiento':True},token)
    check('Documento ficticio',status==201,'PNG de prueba; ningún documento personal')
    payload={**source,'precio_confirmado':q['data']['precio_dia'],'documento_id':d['data']['document']['id'],'aceptacion':acceptance}
    keys=[str(uuid.uuid4()) for _ in range(3)]
    with ThreadPoolExecutor(max_workers=3) as ex:
        responses=list(ex.map(lambda key:call('/api/v1/reservations','POST',payload,token,key),keys))
    successful=[i for i,x in enumerate(responses) if x[0]==201]
    check('Reserva concurrente',len(successful)==1 and sorted(r[0] for r in responses)==[201,409,409],'Códigos '+str([r[0] for r in responses]))
    if successful:
        index=successful[0];reservation_id=responses[index][1]['data']['reservation']['id']
        status,replay,_=call('/api/v1/reservations','POST',payload,token,keys[index])
        check('Idempotencia',status in (200,201) and replay['data']['reservation']['id']==reservation_id,'Mismo identificador al repetir la solicitud')
        status,shared,_=call('/api/v1/reservations/'+str(reservation_id),token=token,base='http://127.0.0.1:19003')
        check('Reserva compartida entre nodos',status==200,'Lectura autenticada desde otra entrada de nodo')
    dc('stop','nodo2')
    try:
        try:call('/health',base='http://127.0.0.1:19002');check('Detección de caída',False)
        except (URLError,ConnectionError,OSError):check('Detección de caída',True,'Nodo2 sin servicio')
        status,b,_=call('/health');check('Continuidad con nodo2 detenido',status==200 and b['nodo']!='nodo2','Respuesta de '+b.get('nodo','desconocido'))
        status,b,_=call('/api/v1/vehicles');check('Catálogo durante falla',status==200 and len(b['data']['vehicles'])==3,'Datos accesibles con una API retirada')
    finally:dc('start','nodo2')
    for _ in range(20):
        try:
            status,b,_=call('/health',base='http://127.0.0.1:19002')
            if status==200:recovered=True;break
        except (URLError,OSError):pass
        time.sleep(1)
    check('Recuperación nodo2',recovered,'Respuesta de salud tras iniciar el contenedor')
except Exception as e:
    check('Ejecución de integración',False,type(e).__name__+': '+str(e)[:160])
finally:
    if reservation_id and token:
        try:
            status,_,_=call('/api/v1/reservations/'+str(reservation_id)+'/cancel','POST',{},token)
            check('Cancelación de reserva ficticia',status==200,'Se conserva su historial de prueba')
        except Exception:check('Cancelación de reserva ficticia',False)
    report={'fecha':'2026-11-10','entorno':'Laboratorio local Windows y Docker Desktop','pruebas':checks,'aprobadas':sum(x['resultado']=='APROBADA' for x in checks),'fallidas':sum(x['resultado']=='FALLIDA' for x in checks),'carga_comercial':'No ejecutada','auditoria_externa':'No ejecutada'}
    (OUT/'integracion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True,indent=2))
    if report['fallidas']:raise SystemExit(1)
