import { ApiError } from '../utils/api-error.js';
import { bodyObject, boundedText } from './booking.validator.js';
export function parseDriverDocument(value: unknown) {
  const b = bodyObject(value, ['titular','pais','vencimiento','frente','reverso','consentimiento']);
  if (b.consentimiento !== true) throw new ApiError(400,'LICENSE_CONSENT_REQUIRED','Autoriza la revisión de tu licencia.');
  const expiry=String(b.vencimiento||'');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||new Date(expiry).toISOString().slice(0,10)!==expiry||expiry<new Date(Date.now()-6*3600000).toISOString().slice(0,10)) throw new ApiError(400,'LICENSE_EXPIRED','La licencia debe estar vigente.');
  function photo(value:unknown) {
    if(typeof value!=='string'||value.length>4194304||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new ApiError(400,'LICENSE_IMAGE_INVALID','Adjunta imágenes JPG, PNG o WebP de hasta 3 MB.');
    const bytes=Buffer.from(value,'base64');let type='';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
    else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
    else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')type='image/webp';
    if(!type||bytes.length<16||bytes.length>3*1024*1024) throw new ApiError(400,'LICENSE_IMAGE_INVALID','Adjunta ambas caras de la licencia en JPG, PNG o WebP, hasta 3 MB cada una.');
    return {bytes,type};
  }
  return {holder:boundedText(b.titular,180),country:boundedText(b.pais,80),expiry,front:photo(b.frente),back:photo(b.reverso)};
}
