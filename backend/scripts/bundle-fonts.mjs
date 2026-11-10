import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fonts={Regular:'ecdb53099b1a68cd24c6900ea5beeafec81bd3c8cb9d0f3c51b9986583ba3982',Medium:'492dec3bc33255f9d81bd5fb18704ad72f96f9b9318e4171bc9f9be9dd4bf44b',SemiBold:'d7ba633bab7f40576e539a7e934a1301d7618dceea59c743de477c2c493462fc',Bold:'b7e339223d56e8c4210c86f1ba87b3d43d6c47e03956ea56f0a7a938ae61b2a3'};
const folder=new URL('../../mobile/assets/fonts/',import.meta.url);await mkdir(folder,{recursive:true});
for(const [name,hash]of Object.entries(fonts)){
  const target=new URL(`Inter-${name}.ttf`,folder);let current;try{current=await readFile(target);}catch{}
  if(current&&createHash('sha256').update(current).digest('hex')===hash)continue;
  let done=false;for(let i=0;i<4&&!done;i++)try{
    const response=await fetch(`https://fonts.gstatic.com/s/a/${hash}.ttf`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('FONT_HTTP');
    const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('FONT_HASH');
    await writeFile(target,bytes);console.info(`Inter ${name} verificada`);done=true;
  }catch(e){if(i===3)throw e;}
}
const license=await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt',{signal:AbortSignal.timeout(30000)});
if(!license.ok)throw new Error('FONT_LICENSE');await writeFile(new URL('OFL.txt',folder),await license.text());
