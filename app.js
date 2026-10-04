/* 原生 WebGL2 渲染器 / 相机 / 昼夜。无外部库、外部素材或网络请求。 */
(async function () {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('world'),error=$('error');
  function fail(e){error.hidden=false;error.textContent='山城暂时无法呈现：'+(e.message||e)+'。请使用支持 WebGL2 的浏览器，并开启硬件加速。';$('loading').style.display='none';console.error(e);}
  window.addEventListener('error',e=>fail(e.error||e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
  const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>scale(a,1/(Math.hypot(...a)||1));
  function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
  function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
  function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);}
  function lookAt(eye,target,up=[0,1,0]){const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
  const gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  if(!gl){fail(new Error('浏览器未提供 WebGL2'));return;}
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function program(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec3 a_position;layout(location=1) in vec3 a_normal;layout(location=2) in vec3 a_color;
  layout(location=3) in vec3 a_offset;layout(location=4) in vec3 a_size;layout(location=5) in vec3 a_icolor;layout(location=6) in float a_kind;
  uniform mat4 u_vp,u_lightVP;uniform bool u_instanced;
  out vec3 v_position,v_normal,v_color;out vec4 v_shadow;flat out float v_kind;
  void main(){vec3 p=u_instanced?a_position*a_size+a_offset:a_position;v_position=p;v_normal=a_normal;v_color=u_instanced?a_icolor:a_color;v_kind=u_instanced?a_kind:0.;v_shadow=u_lightVP*vec4(p,1.);gl_Position=u_vp*vec4(p,1.);}`;
  const fragment=`#version 300 es
  precision highp float;
  in vec3 v_position,v_normal,v_color;in vec4 v_shadow;flat in float v_kind;out vec4 outColor;
  uniform sampler2D u_shadow;uniform vec3 u_light,u_lightColor,u_eye,u_fogColor;uniform float u_day,u_night,u_clock,u_fog,u_direct;
  float shadow(vec3 n){vec3 p=v_shadow.xyz/v_shadow.w*.5+.5;if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return 1.;float bias=max(.0011*(1.-dot(n,u_light)),.00032),sum=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){float d=texture(u_shadow,p.xy+vec2(x,y)/2048.).r;sum+=(p.z-bias<=d)?1.:.35;}return sum/9.;}
  void main(){vec3 n=normalize(v_normal),base=pow(v_color,vec3(2.2));float lambert=max(dot(n,u_light),0.),sh=shadow(n);float hemi=.72+.28*n.y;
    vec3 light=vec3(.10,.16,.20)*(1.-u_day)+vec3(.48,.52,.45)*u_day;
    vec3 col=base*(light*hemi+u_lightColor*lambert*sh*u_direct);
    col+=base*vec3(.11,.065,.019)*u_night*step(6.,v_position.y)*step(v_position.y,104.);
    if(v_kind>.5&&v_kind<1.5){float wave=sin(floor(v_position.x*5.)*.13+floor(v_position.z*5.)*.17-u_clock*1.4);vec3 view=normalize(u_eye-v_position);float fres=pow(1.-max(dot(view,n),0.),3.);col=mix(col, pow(u_fogColor,vec3(2.2))*.8, .26+fres*.4);col+=vec3(.04,.09,.1)*(.5+.5*wave)*(.2+u_day);}
    if(v_kind>1.5&&v_kind<2.5){col=mix(base*vec3(.38,.28,.16),base*(2.5+u_night*2.5),u_night);}
    if(v_kind>3.5){float streak=sin(floor(v_position.y*5.)*.24+floor(v_position.x*5.)*.7+u_clock*7.);col=base*(.32+u_day*.8+(.5+.5*streak)*.12);}
    col=col/(col+vec3(.67));col=pow(max(col,0.),vec3(1./2.2));float dist=length(u_eye-v_position);float fog=1.-exp(-pow(dist*u_fog,1.5));if(v_kind>2.5&&v_kind<3.5)fog=max(fog,.42);col=mix(col,u_fogColor,min(.9,fog));outColor=vec4(col,1.);}`;
  const shadowFragment=`#version 300 es
  precision highp float;void main(){}`;
  const screenVertex=`#version 300 es
  precision highp float;out vec2 v_uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);v_uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const skyFragment=`#version 300 es
  precision highp float;in vec2 v_uv;out vec4 outColor;
  uniform vec3 u_forward,u_right,u_up,u_sun,u_moon,u_fogColor;uniform float u_aspect,u_tan,u_day,u_night,u_clock,u_dusk;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  void main(){vec2 uv=v_uv*2.-1.;vec3 ray=normalize(u_forward+u_right*uv.x*u_aspect*u_tan+u_up*uv.y*u_tan);float h=max(ray.y,0.);
    vec3 top=mix(vec3(.028,.064,.14),vec3(.26,.49,.59),u_day);vec3 horizon=u_fogColor;vec3 col=mix(horizon,top,pow(h,.55));
    float glow=pow(max(dot(ray,u_sun),0.),14.)*u_dusk;col+=vec3(.34,.13,.035)*glow;
    vec2 sunUV=vec2(dot(ray,normalize(cross(u_sun,vec3(0,1,0)))),dot(ray,normalize(cross(normalize(cross(u_sun,vec3(0,1,0))),u_sun))))/.027;
    float sd=length(floor(sunUV*11.)/11.);if(dot(ray,u_sun)>.998&&sd<1.&&u_sun.y>-.12)col=mix(vec3(1.,.57,.21),vec3(1.,.94,.7),u_day);
    vec2 moonUV=vec2(dot(ray,normalize(cross(u_moon,vec3(0,1,0)))),dot(ray,normalize(cross(normalize(cross(u_moon,vec3(0,1,0))),u_moon))))/.021;
    float md=length(floor(moonUV*10.)/10.);if(dot(ray,u_moon)>.999&&md<1.&&u_moon.y>-.1)col=mix(col,vec3(.79,.89,.93),u_night);
    vec2 sp=vec2(atan(ray.z,ray.x)*320.,asin(ray.y)*320.);vec2 cell=floor(sp);float star=step(.992,hash(cell))*pow(max(0.,1.-length(fract(sp)-.5)*2.),8.);col+=star*u_night*clamp(ray.y*4.,0.,1.)*(.8+.2*sin(u_clock+hash(cell)*20.));
    float cloud=sin(ray.x*19.+ray.z*13.+u_clock*.005)+sin(ray.x*43.-ray.z*26.+ray.y*120.)*.45+sin(ray.z*75.+ray.x*26.+ray.y*220.)*.18;float mask=smoothstep(.8,1.3,cloud)*smoothstep(.015,.09,ray.y)*(1.-smoothstep(.22,.46,ray.y));col=mix(col,mix(vec3(.10,.16,.23),vec3(.77,.82,.73),u_day),mask*.42);
    outColor=vec4(col,1.);}`;
  const postFragment=`#version 300 es
  precision highp float;in vec2 v_uv;out vec4 outColor;uniform sampler2D u_scene;uniform vec2 u_pixel;uniform float u_night;
  void main(){vec3 c=texture(u_scene,v_uv).rgb,bloom=vec3(0.);for(int i=0;i<8;i++){float a=float(i)*.785398;vec3 b=texture(u_scene,v_uv+vec2(cos(a),sin(a))*u_pixel*4.).rgb;bloom+=max(b-vec3(.72),vec3(0.));}c+=bloom*(.07+.13*u_night);float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);c+=(noise-.5)/255.;outColor=vec4(c,1.);}`;
  const mainP=program(vertex,fragment),depthP=program(vertex,shadowFragment),skyP=program(screenVertex,skyFragment),postP=program(screenVertex,postFragment);
  const uniforms=new Map();function loc(p,name){const key=p+name;let m=uniforms.get(p);if(!m){m=new Map();uniforms.set(p,m);}if(!m.has(name))m.set(name,gl.getUniformLocation(p,name));return m.get(name);}
  function uf(p,name,n){gl.uniform1f(loc(p,name),n);}function ui(p,name,n){gl.uniform1i(loc(p,name),n);}function uv(p,name,v){gl.uniform3fv(loc(p,name),v);}function um(p,name,m){gl.uniformMatrix4fv(loc(p,name),false,m);}
  function attr(index,size,stride,offset,divisor=0){gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(index,divisor);}
  $('load-status').textContent='构筑原创山城与体素道路…';
  const world=await YSWorld.create(s=>$('load-status').textContent=s,()=>new Promise(r=>setTimeout(r,0)));
  const terrainVAO=gl.createVertexArray();gl.bindVertexArray(terrainVAO);const terrainBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,terrainBuffer);gl.bufferData(gl.ARRAY_BUFFER,world.terrain,gl.STATIC_DRAW);attr(0,3,36,0);attr(1,3,36,12);attr(2,3,36,24);const terrainCount=world.terrain.length/9;
  const cube=[];function face(a,b,c,d,n){for(const p of[a,b,c,a,c,d])cube.push(...p,...n);}
  face([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);face([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
  face([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);face([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
  face([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);face([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);
  const cubeVAO=gl.createVertexArray();gl.bindVertexArray(cubeVAO);const cubeBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cubeBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(cube),gl.STATIC_DRAW);attr(0,3,24,0);attr(1,3,24,12);
  const instanceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,world.instances,gl.STATIC_DRAW);attr(3,3,40,0,1);attr(4,3,40,12,1);attr(5,3,40,24,1);attr(6,1,40,36,1);const instanceCount=world.instances.length/10;
  gl.bindVertexArray(null);
  const shadowTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,2048,2048,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const shadowFBO=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('阴影缓冲创建失败');
  const sceneFBO=gl.createFramebuffer(),sceneTex=gl.createTexture(),sceneDepth=gl.createRenderbuffer();
  let highQuality=true,renderW=0,renderH=0;
  function resize(){const dpr=Math.min(devicePixelRatio||1,highQuality?1.5:.85);renderW=Math.max(1,Math.round(innerWidth*dpr));renderH=Math.max(1,Math.round(innerHeight*dpr));canvas.width=renderW;canvas.height=renderH;
    gl.bindTexture(gl.TEXTURE_2D,sceneTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,renderW,renderH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER,sceneDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,renderW,renderH);gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sceneTex,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,sceneDepth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('画面缓冲创建失败');gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  resize();window.addEventListener('resize',()=>{resize();render();});
  const params=new URLSearchParams(location.search);let hours=params.has('time')?Number(params.get('time')):16+20/60,paused=params.get('paused')==='1',daySeconds=120;
  const presets={
    overview:{eye:[276,194,308],target:[-4,48,-30],title:'山城全景',subtitle:'重岭入画 · 古城依山'},
    falls:{eye:[137,99,69],target:[57,67,-46],title:'瀑畔观澜',subtitle:'飞瀑两叠 · 七重观澜'},
    summit:{eye:[-140,185,-21],target:[-54,113,-97],title:'云顶揽胜',subtitle:'揽云亭上 · 群山如海'},
    city:{eye:[67,44,140],target:[-12,30,29],title:'万家灯火',subtitle:'溪桥石巷 · 一城烟火'}
  };
  let eye=[...presets.overview.eye],target=[...presets.overview.target],mode='orbit',view='overview',yaw=0,pitch=0,distance=400,transition=null,flyYaw=0,flyPitch=0,tourDistance=0,tourPlaying=false,tourYaw=0,tourPitch=0;
  function syncOrbit(){const d=sub(eye,target);distance=Math.hypot(...d);yaw=Math.atan2(d[0],d[2]);pitch=Math.asin(d[1]/distance);}
  function syncFly(){const f=norm(sub(target,eye));flyYaw=Math.atan2(f[0],f[2]);flyPitch=Math.asin(f[1]);}
  syncOrbit();
  function setView(name,instant=false){const p=presets[name];if(!p)return;mode='orbit';tourPlaying=false;view=name;transition=instant?null:{eye:[...eye],target:[...target],endEye:p.eye,endTarget:p.target,start:performance.now()};if(instant){eye=[...p.eye];target=[...p.target];syncOrbit();}document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('view-title').textContent=p.title;$('view-subtitle').textContent=p.subtitle;updateModes();render();}

  function lightState(h){const theta=(h-6)/24*Math.PI*2,sun=norm([Math.cos(theta),Math.sin(theta),.16*Math.sin(theta)-.14]),moon=scale(sun,-1),day=clamp((sun[1]+.10)/.42,0,1),night=1-clamp((sun[1]+.11)/.25,0,1),dusk=clamp(1-Math.abs(sun[1])/.45,0,1),dir=sun[1]>-.04?sun:moon;
    const fog=[lerp(.10,lerp(.56,.75,dusk),day),lerp(.17,lerp(.69,.60,dusk),day),lerp(.25,lerp(.68,.47,dusk),day)];return {sun,moon,day,night,dusk,dir:sun[1]>=0?sun:moon,fog,direct:(.35+day*1.15)*clamp(Math.abs(sun[1])/.32,0,1),color:[lerp(.52,1,day),lerp(.63,lerp(.96,.66,dusk),day),lerp(.84,lerp(.80,.40,dusk),day)]};}
  let lastShadow=-Infinity,lastShadowHour=-100,lightVP,clock=0,frames=0,fps=0,fpsStart=performance.now(),bootTime=performance.now(),last=performance.now();
  const keys=new Set(),pointers=new Map();let dragging=false,pointerButton=0,pinch=0;
  function updateModes(){const touring=mode==='tour';$('tour').classList.toggle('active',touring);$('tour').textContent=touring?(tourDistance>=world.routeLength?'↻ 重新漫游':tourPlaying?'Ⅱ 暂停漫游':'▷ 继续漫游'):'▷ 沿路漫游';$('fly').classList.toggle('active',mode==='fly');$('fly').textContent=mode==='fly'?'退出飞行':'自由飞行';$('hint').textContent=mode==='fly'?'拖动转向 · WASD 移动 · Q / E 升降 · Shift 加速':touring?'沿城门至云顶 · 拖动环顾 · Esc 退出':'拖动旋转 · 滚轮缩放 · 右键平移';}
  function updateTimeUI(){hours=((hours%24)+24)%24;const mins=Math.floor(hours*60+.000001)%1440;$('time').textContent=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');$('hours').value=hours;
    const names=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'],phrases=['星河在天','万籁俱寂','山城待晓','晨光入谷','云开见城','日照重楼','日中山明','山影渐移','日影渐长','暮色入城','灯火初上','月照溪桥'];const index=Math.floor((hours+1)/2)%12;$('period').textContent=names[index]+'时 · '+phrases[index];$('play').textContent=paused?'▶':'Ⅱ';$('play').title=paused?'自动推进昼夜':'暂停昼夜循环';$('play').setAttribute('aria-label',$('play').title);}
  function setTime(h){hours=((Number(h)%24)+24)%24;lastShadowHour=-100;updateTimeUI();render();}
  function setPaused(value){paused=!!value;updateTimeUI();render();}
  $('hours').addEventListener('input',e=>setTime(e.target.value));$('play').onclick=()=>setPaused(!paused);$('speed').onchange=e=>{daySeconds=Number(e.target.value);};
  document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>setTime(b.dataset.time));document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  function toggleTour(){transition=null;if(mode==='tour'&&tourDistance<world.routeLength){tourPlaying=!tourPlaying;}else{mode='tour';tourDistance=0;tourPlaying=true;tourYaw=0;tourPitch=0;document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));$('view-title').textContent='沿路漫游';$('view-subtitle').textContent='城门 · 溪桥 · 观澜 · 揽云';}updateModes();render();}
  function toggleFly(){transition=null;if(mode==='fly'){mode='orbit';target=add(eye,scale([Math.sin(flyYaw)*Math.cos(flyPitch),Math.sin(flyPitch),Math.cos(flyYaw)*Math.cos(flyPitch)],40));syncOrbit();}else{mode='fly';syncFly();tourPlaying=false;}updateModes();render();}
  $('tour').onclick=toggleTour;$('fly').onclick=toggleFly;$('quality').onclick=()=>{highQuality=!highQuality;$('quality').textContent=highQuality?'画质 · 高':'画质 · 流畅';resize();render();};
  $('help').onclick=()=>{$('instructions').showModal();};$('close-help').onclick=()=>{$('instructions').close();};$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});};
  function cancelTransition(){if(transition){transition=null;syncOrbit();}}
  function orbitMove(dx,dy,pan){cancelTransition();if(pan){const f=norm(sub(target,eye)),right=norm(cross(f,[0,1,0])),up=norm(cross(right,f)),s=distance*.0012;target=add(target,add(scale(right,-dx*s),scale(up,dy*s)));}else{yaw-=dx*.005;pitch=clamp(pitch+dy*.0045,.035,1.47);}eye=add(target,[Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance]);}
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);dragging=true;pointerButton=e.button;pinch=0;});
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId),dx=e.clientX-old[0],dy=e.clientY-old[1];pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){const points=[...pointers.values()],d=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);if(pinch&&mode==='orbit'){distance=clamp(distance*pinch/d,9,650);orbitMove(0,0,false);}pinch=d;}
    else if(mode==='orbit')orbitMove(dx,dy,pointerButton===2||e.shiftKey);
    else if(mode==='fly'){flyYaw-=dx*.005;flyPitch=clamp(flyPitch-dy*.0045,-1.4,1.4);}
    else{tourYaw-=dx*.005;tourPitch=clamp(tourPitch-dy*.0045,-1.1,1.1);}render();
  });
  function pointerUp(e){pointers.delete(e.pointerId);dragging=pointers.size>0;pinch=0;}
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(mode==='orbit'){cancelTransition();distance=clamp(distance*Math.exp(e.deltaY*.001),9,650);orbitMove(0,0,false);render();}},{passive:false});
  window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||$('instructions').open)return;keys.add(e.code);if(e.code==='Space'){e.preventDefault();if(!e.repeat)setPaused(!paused);}if(/^Digit[1-4]$/.test(e.code))setView(['overview','falls','summit','city'][Number(e.code.slice(-1))-1]);if(e.code==='KeyH'&&!e.repeat)document.body.classList.toggle('hidden-ui');if(e.code==='Escape'){mode='orbit';transition=null;tourPlaying=false;syncOrbit();updateModes();}});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  function updateCamera(dt,now){
    if(transition){const t=clamp((now-transition.start)/1700,0,1),s=t*t*(3-2*t);eye=transition.eye.map((v,i)=>lerp(v,transition.endEye[i],s));target=transition.target.map((v,i)=>lerp(v,transition.endTarget[i],s));if(t===1){transition=null;syncOrbit();}}
    if(mode==='fly'){const f=[Math.sin(flyYaw)*Math.cos(flyPitch),Math.sin(flyPitch),Math.cos(flyYaw)*Math.cos(flyPitch)],r=norm(cross(f,[0,1,0])),s=(keys.has('ShiftLeft')||keys.has('ShiftRight')?55:18)*dt;let move=[0,0,0];if(keys.has('KeyW'))move=add(move,f);if(keys.has('KeyS'))move=sub(move,f);if(keys.has('KeyD'))move=add(move,r);if(keys.has('KeyA'))move=sub(move,r);if(keys.has('KeyE'))move[1]+=1;if(keys.has('KeyQ'))move[1]-=1;eye=add(eye,scale(move,s));eye[0]=clamp(eye[0],-230,230);eye[2]=clamp(eye[2],-230,230);eye[1]=clamp(Math.max(eye[1],world.heightAt(eye[0],eye[2])+1.8),2,250);target=add(eye,scale(f,40));}
    if(mode==='tour'){if(tourPlaying)tourDistance=Math.min(world.routeLength,tourDistance+dt*8);eye=world.routeAt(tourDistance);const next=world.routeAt(Math.min(world.routeLength,tourDistance+6)),delta=sub(next,eye);let heading=Math.atan2(delta[0],delta[2]);if(Math.hypot(delta[0],delta[2])<.1){heading=Math.atan2(20-eye[0],90-eye[2]);}const elevation=(tourDistance>=world.routeLength?-.12:clamp(Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))*.5,-.25,.4))+tourPitch;target=add(eye,scale([Math.sin(heading+tourYaw)*Math.cos(elevation),Math.sin(elevation),Math.cos(heading+tourYaw)*Math.cos(elevation)],10));if(tourDistance===world.routeLength&&tourPlaying){tourPlaying=false;updateModes();$('view-title').textContent='抵达揽云亭';$('view-subtitle').textContent='回望巨城 · 云山千重';}}
  }
  function drawGeometry(p){ui(p,'u_instanced',0);gl.bindVertexArray(terrainVAO);gl.drawArrays(gl.TRIANGLES,0,terrainCount);ui(p,'u_instanced',1);gl.bindVertexArray(cubeVAO);gl.drawArraysInstanced(gl.TRIANGLES,0,36,instanceCount);gl.bindVertexArray(null);}
  function render(){const state=lightState(hours),now=performance.now();
    if(!lightVP||Math.abs(hours-lastShadowHour)>.04||now-lastShadow>2200){const lightEye=add([0,50,-15],scale(state.dir,390));lightVP=multiply(ortho(-270,270,-220,250,1,820),lookAt(lightEye,[0,50,-15]));gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFBO);gl.viewport(0,0,2048,2048);gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(depthP);um(depthP,'u_vp',lightVP);um(depthP,'u_lightVP',lightVP);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.1,2);drawGeometry(depthP);gl.disable(gl.POLYGON_OFFSET_FILL);lastShadow=now;lastShadowHour=hours;}
    const aspect=renderW/renderH,fov=2*Math.atan(Math.tan(25*Math.PI/180)*Math.max(1,1.15/aspect)),forward=norm(sub(target,eye)),right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));const vp=multiply(perspective(fov,aspect,.15,1100),lookAt(eye,target));
    gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO);gl.viewport(0,0,renderW,renderH);gl.disable(gl.DEPTH_TEST);gl.useProgram(skyP);uv(skyP,'u_forward',forward);uv(skyP,'u_right',right);uv(skyP,'u_up',up);uv(skyP,'u_sun',state.sun);uv(skyP,'u_moon',state.moon);uv(skyP,'u_fogColor',state.fog);uf(skyP,'u_aspect',aspect);uf(skyP,'u_tan',Math.tan(fov/2));uf(skyP,'u_day',state.day);uf(skyP,'u_night',state.night);uf(skyP,'u_dusk',state.dusk);uf(skyP,'u_clock',clock);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(mainP);um(mainP,'u_vp',vp);um(mainP,'u_lightVP',lightVP);uv(mainP,'u_light',state.dir);uv(mainP,'u_lightColor',state.color);uv(mainP,'u_eye',eye);uv(mainP,'u_fogColor',state.fog);uf(mainP,'u_day',state.day);uf(mainP,'u_night',state.night);uf(mainP,'u_direct',state.direct);uf(mainP,'u_clock',clock);uf(mainP,'u_fog',.00065+state.night*.00075);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,shadowTex);ui(mainP,'u_shadow',0);drawGeometry(mainP);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,renderW,renderH);gl.disable(gl.DEPTH_TEST);gl.useProgram(postP);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);ui(postP,'u_scene',0);gl.uniform2f(loc(postP,'u_pixel'),1/renderW,1/renderH);uf(postP,'u_night',state.night);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  let active=true,uiTick=0;
  function tick(now){if(!active)return;const elapsed=Math.max(0,(now-last)/1000);last=now;clock+=elapsed;if(!paused)hours=(hours+elapsed*24/daySeconds)%24;updateCamera(Math.min(elapsed,.1),now);if(now-uiTick>120){updateTimeUI();uiTick=now;}render();frames++;if(now-fpsStart>1000){fps=frames*1000/(now-fpsStart);frames=0;fpsStart=now;}requestAnimationFrame(tick);}
  window.addEventListener('pagehide',()=>{active=false;});window.addEventListener('pageshow',()=>{if(!active){active=true;last=performance.now();requestAnimationFrame(tick);}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();active=false;fail(new Error('图形上下文已丢失，请刷新页面'));});
  if(params.has('view'))setView(params.get('view'),true);
  updateModes();updateTimeUI();render();$('stats').textContent=world.buildings+' 栋古建 · 384 × 384 m 山城';$('loading').style.opacity='0';setTimeout(()=>$('loading').style.display='none',850);requestAnimationFrame(tick);
  // 可读的诊断接口，供项目验证使用；不依赖额外测试框架。
  window.YSApp={world,setTime,setPaused,setView,toggleTour,toggleFly,render,lightState,snapshot:()=>({hours,paused,daySeconds,mode,tourPlaying,tourDistance,eye:[...eye],target:[...target],view,canvas:[canvas.width,canvas.height],fps,terrainTriangles:terrainCount/3,instances:instanceCount,buildings:world.buildings,glError:gl.getError(),ready:true,elapsed:(performance.now()-bootTime)/1000})};
})().catch(e=>{const el=document.getElementById('error');el.hidden=false;el.textContent='场景初始化失败：'+e.message;document.getElementById('loading').style.display='none';console.error(e);});
