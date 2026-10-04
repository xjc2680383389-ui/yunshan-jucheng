/* 云山巨城：原创确定性体素生成器。所有实体表面均对齐 0.2 m 网格。 */
(function (root) {
  'use strict';
  const V = 0.2, SIZE = 384, N = Math.round(SIZE / V), HALF = SIZE / 2;
  const q = x => Math.round(x / V) * V;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  let seed = 182713;
  function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  function hex(s) { return [(s >> 16 & 255) / 255, (s >> 8 & 255) / 255, (s & 255) / 255]; }
  const COLORS = {
    grass: hex(0x617d61), rock: hex(0x7b8176), stone: hex(0xb4b09a), road: hex(0xc2bba4),
    wall: hex(0xe1c9a4), plaster: hex(0xd7d5bd), wood: hex(0x754b37), red: hex(0x9c4a38),
    roof: hex(0x425d58), ridge: hex(0x718b72), gold: hex(0xc9ae73), water: hex(0x4a9caa),
    whitewater: hex(0xb0dcd9), glow: hex(0xffb759), leaf: hex(0x3f6951), trunk: hex(0x705c45)
  };
  const hills = [[-68,-111,132,32,39],[11,-157,118,38,28],[87,-101,106,36,40],[-146,-42,79,28,42],[151,-48,79,26,34],[-131,-155,88,29,32],[151,-160,111,33,29]];
  function natural(x,z) {
    let sum=0,peak=0;
    for (const [hx,hz,a,sx,sz] of hills) {const v=a*Math.exp(-((x-hx)**2/(2*sx*sx)+(z-hz)**2/(2*sz*sz)));sum+=v;peak=Math.max(peak,v);}
    let h=4.8+peak+sum*.12;
    h += (Math.sin(x*.071+z*.033)*4.1+Math.sin(z*.116-x*.043)*2.8) * clamp((30-z)/100,0,1);
    return h;
  }
  const districts = [
    {x0:-96,x1:116,z0:40,z1:112,y:12}, {x0:-83,x1:96,z0:0,z1:40,y:28.8},
    {x0:-64,x1:38,z0:-40,z1:0,y:48}, {x0:-54,x1:13,z0:-69,z1:-40,y:68.4}
  ];
  const riverX = z => -52 + Math.sin(z*.026)*17;
  const districtY=(d,z,x=0)=>d.y+(d.y<60?((d.z0+d.z1)/2-z)*.30+Math.sin(x*.04+z*.047)*2.4+Math.sin(x*.095-z*.035)*1.2:0);
  function groundBase(x,z) {
    let h = natural(x,z);
    for(const d of districts) {
      const dist = Math.max(d.x0-x, x-d.x1, d.z0-z, z-d.z1, 0);
      if(dist<12) h=mix(districtY(d,z,x),h,clamp(dist/12,0,1));
    }
    if ((x-51)**2/16**2+(z+63)**2/22**2<1 && z<-55) h=Math.max(h,94.8);
    if (x>42 && x<64 && z>=-55 && z<-42) h=52.8;
    if (x>37 && x<68 && z>=-42 && z<-24) h=13.2;
    if (x>69 && x<98 && z>-56 && z<-26) h=52.8;
    if(z>-26) {
      const r=Math.abs(x-riverX(z));
      if(r<6.2) h=1.2;
      else if(r<10) h=mix(1.2,h,(r-6.2)/3.8);
    }
    if ((x-51)**2/19**2+(z+28)**2/14**2<1) h=10.8;
    return Math.round(Math.max(1.2,h)/1.2)*1.2;
  }
  const summitY=q(groundBase(-68,-111));
  const tourPoints = [
    [20,12,119],[20,12,84],[-27,12,84],[-75,12,69],[-75,20.4,44],[-31,28.8,25],
    [-3,28.8,25],[-3,38.4,3],[27,48,-16],[74,52.8,-24],[27,48,-16],[-21,48,-22],
    [-25,68.4,-46],[-62,78,-40],[-62,80.4,-57],[-99,102,-64],[-94,123.6,-86],[-68,summitY,-101],[-68,summitY,-111]
  ];
  // 支巷沿山台与溪岸折转，街块大小各异，避免横平竖直的等距街网。
  const streets = [
    [[20,84],[42,77],[64,65],[87,73],[112,92]],
    [[20,84],[31,101],[58,105],[82,96],[112,92]],
    [[64,65],[53,47],[30,43],[17,56],[20,84]],
    [[-75,69],[-86,83],[-90,104],[-72,111]],
    [[-75,69],[-90,51],[-76,33],[-73,9]],
    [[-27,84],[-17,97],[5,108],[20,116]],
    [[-27,84],[-19,61],[-34,48],[-29,30],[-31,25]],
    [[-3,25],[24,16],[48,8],[71,18],[87,35],[95,54],[87,73]],
    [[-3,25],[8,37],[30,43]],
    [[27,-16],[15,-5],[-2,-9],[-21,-22]],
    [[-21,-22],[-41,-33],[-61,-27],[-65,-8]],
    [[-25,-46],[-43,-42],[-54,-51]]
  ].map(points=>points.map(([x,z])=>[x,q(groundBase(x,z)),z]));
  function segmentDistance(x,z,a,b) {
    const dx=b[0]-a[0], dz=b[2]-a[2], l=dx*dx+dz*dz;
    const t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(l||1),0,1);
    return [Math.hypot(x-mix(a[0],b[0],t),z-mix(a[2],b[2],t)),mix(a[1],b[1],t)];
  }
  function roadDistance(x,z) {
    let min=1e9;
    for(let i=1;i<tourPoints.length;i++) min=Math.min(min,segmentDistance(x,z,tourPoints[i-1],tourPoints[i])[0]);
    return min;
  }
  class Writer {
    constructor() { this.data=new Float32Array(1048576); this.length=0; }
    vertex(p,n,c) {
      if(this.length+9>this.data.length){const a=new Float32Array(Math.ceil(this.data.length*1.7));a.set(this.data);this.data=a;}
      this.data.set([p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2]],this.length);this.length+=9;
    }
    quad(a,b,c,d,n,color) { this.vertex(a,n,color);this.vertex(b,n,color);this.vertex(c,n,color);this.vertex(a,n,color);this.vertex(c,n,color);this.vertex(d,n,color); }
    finish() { return this.data.slice(0,this.length); }
  }
  async function create(progress=()=>{},yieldWork=()=>Promise.resolve()) {
    seed=182713;
    const H=new Uint16Array(N*N), M=new Uint8Array(N*N), boxes=[], landmarks=[];
    const coarseN=241, coarse=new Float32Array(coarseN*coarseN);
    for(let z=0;z<coarseN;z++) for(let x=0;x<coarseN;x++) coarse[z*coarseN+x]=natural(x*1.6-HALF,z*1.6-HALF);
    function raw(x,z) {
      const cx=(x+HALF)/1.6,cz=(z+HALF)/1.6,ix=clamp(Math.floor(cx),0,239),iz=clamp(Math.floor(cz),0,239),tx=cx-ix,tz=cz-iz;
      let h=mix(mix(coarse[iz*coarseN+ix],coarse[iz*coarseN+ix+1],tx),mix(coarse[(iz+1)*coarseN+ix],coarse[(iz+1)*coarseN+ix+1],tx),tz);
      let mat=0;
      for(const d of districts){const dist=Math.max(d.x0-x,x-d.x1,d.z0-z,z-d.z1,0);if(dist<12){h=mix(districtY(d,z,x),h,dist/12);if(dist===0)mat=d.y>=60||Math.sin(x*.061+z*.093)+Math.cos(x*.083-z*.047)<.5?1:0;}}
      if((x-51)**2/16**2+(z+63)**2/22**2<1&&z<-55)h=Math.max(h,94.8);
      if(x>42&&x<64&&z>=-55&&z<-42){h=52.8;mat=3;}
      if(x>37&&x<68&&z>=-42&&z<-24){h=13.2;mat=3;}
      if(x>69&&x<98&&z>-56&&z<-26){h=52.8;mat=1;}
      if(z>-26){const r=Math.abs(x-riverX(z));if(r<6.2){h=1.2;mat=3;}else if(r<10)h=mix(1.2,h,(r-6.2)/3.8);}
      if((x-51)**2/19**2+(z+28)**2/14**2<1){h=10.8;mat=3;}
      if(h>119)mat=4;
      return [Math.max(6,Math.round(h/1.2)*6),mat];
    }
    progress('雕刻 0.2 米网格的重重山岭…');
    for(let z=0;z<N;z++) {
      for(let x=0;x<N;x++){const v=raw((x+.5)*V-HALF,(z+.5)*V-HALF),idx=z*N+x;H[idx]=v[0];M[idx]=v[1];}
      if(z%240===0)await yieldWork();
    }
    function heightAt(x,z){const ix=clamp(Math.floor((x+HALF)/V),0,N-1),iz=clamp(Math.floor((z+HALF)/V),0,N-1);return H[iz*N+ix]*V;}
    function pad(x,z,w,d,y){const x0=clamp(Math.floor((x-w/2+HALF)/V),0,N-1),x1=clamp(Math.ceil((x+w/2+HALF)/V),0,N),z0=clamp(Math.floor((z-d/2+HALF)/V),0,N-1),z1=clamp(Math.ceil((z+d/2+HALF)/V),0,N);for(let zz=z0;zz<z1;zz++)for(let xx=x0;xx<x1;xx++){H[zz*N+xx]=Math.round(y/V);M[zz*N+xx]=1;}}
    function box(x,y,z,w,h,d,color,kind=0) {
      x=q(x);y=q(y);z=q(z);w=Math.max(V,q(w));h=Math.max(V,q(h));d=Math.max(V,q(d));
      boxes.push(x+w/2,y+h/2,z+d/2,w,h,d,...color,kind);
    }
    const centerBox=(x,y,z,w,h,d,c,k=0)=>box(x-w/2,y,z-d/2,w,h,d,c,k);
    function stampRoad(a,b,width,grade) {
      const len=Math.hypot(b[0]-a[0],b[2]-a[2]),steps=Math.ceil(len/.4),r=Math.ceil((width/2+.6)/V);
      for(let i=0;i<=steps;i++) {
        const t=i/steps,x=mix(a[0],b[0],t),z=mix(a[2],b[2],t),y=q(mix(a[1],b[1],t));
        const gx=Math.round((x+HALF)/V),gz=Math.round((z+HALF)/V);
        const bridge=z>-26&&Math.abs(x-riverX(z))<9;
        if(!bridge)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
          if(dx*dx+dz*dz>r*r)continue;const xx=gx+dx,zz=gz+dz;if(xx<0||zz<0||xx>=N||zz>=N)continue;
          const idx=zz*N+xx;if(grade)H[idx]=Math.round(y/V);M[idx]=2;
        }
      }
      for(let i=0;i<=Math.ceil(len/.8);i++) {
        const t=i/Math.ceil(len/.8),x=q(mix(a[0],b[0],t)),z=q(mix(a[2],b[2],t)),y=q(mix(a[1],b[1],t));
        const bridge=z>-26&&Math.abs(x-riverX(z))<9;
        if(bridge){centerBox(x,y,z,width,.4,1,COLORS.wood);if(i%3===0){for(const side of [-1,1])centerBox(x,y+.4,z+side*(width/2-.2),.4,1,.4,COLORS.red);}}
      }
    }
    progress('贯通城门、溪桥与盘山石道…');
    for(const road of streets)for(let i=1;i<road.length;i++)stampRoad(road[i-1],road[i],1.6,false);
    for(let i=1;i<tourPoints.length;i++)stampRoad(tourPoints[i-1],tourPoints[i],3.6,true);
    // 主路的栏柱与路灯，使山道在远景中也可辨识。
    for(let k=1;k<tourPoints.length;k++) {
      const a=tourPoints[k-1],b=tourPoints[k],len=Math.hypot(b[0]-a[0],b[2]-a[2]),steps=Math.ceil(len/5);
      for(let i=0;i<=steps;i++){
        const t=i/steps,x=mix(a[0],b[0],t),z=mix(a[2],b[2],t),y=q(mix(a[1],b[1],t)),nx=-(b[2]-a[2])/(len||1),nz=(b[0]-a[0])/(len||1);
        for(const s of [-1,1]) {const px=x+nx*2.2*s,pz=z+nz*2.2*s;if(roadDistance(px,pz)>2)centerBox(px,y,pz,.4,1.2,.4,COLORS.stone);}
        if(i%2===0){const px=x+nx*2.4,pz=z+nz*2.4;if(roadDistance(px,pz)>2.1){centerBox(px,y,pz,.2,2.6,.2,COLORS.wood);centerBox(px,y+2.2,pz,.6,.6,.6,COLORS.glow,2);centerBox(px,y+2.8,pz,.8,.2,.8,COLORS.roof);}}
      }
    }
    function roof(x,y,z,w,d,height,color=COLORS.roof) {
      const layers=Math.round(height/V);
      for(let i=0;i<layers;i++){
        const shrink=i*.6,ww=Math.max(1.2,w-shrink),dd=Math.max(.8,d-shrink);
        centerBox(x,y+i*V,z,ww,V,dd,color);
      }
      centerBox(x,y+height,z,Math.max(1.4,w-layers*.6),.4,1,COLORS.ridge);
      // 翘角采用逐格抬高的实体阶梯，不使用曲面构件。
      for(const sx of [-1,1])for(const sz of [-1,1])for(let k=0;k<4;k++)centerBox(x+sx*(w/2-.5+k*.2),y+.2+k*.2,z+sz*(d/2-.5+k*.2),.8,.2,.8,color);
      for(const s of [-1,1])centerBox(x,y-.2,z+s*(d/2-.4),w,.2,.4,COLORS.ridge);
    }
    let buildings=0;
    const buildingTypes={}, lots=[];
    function house(x,z,y,w=8,d=7,floors=1,royal=false) {
      buildings++;
      buildingTypes['殿阁城楼']=(buildingTypes['殿阁城楼']||0)+1;
      const h=floors*3.4,wood=royal?COLORS.red:COLORS.wood;
      centerBox(x,y,z,w+.8,.6,d+.8,COLORS.stone);
      centerBox(x,y+.6,z,w,h,d,royal?COLORS.wall:COLORS.plaster);
      for(const sx of [-1,1])for(const sz of [-1,1])centerBox(x+sx*(w/2-.3),y+.6,z+sz*(d/2-.3),.4,h+.2,.4,wood);
      for(let f=0;f<floors;f++) {
        for(let wx=-w/2+1.2;wx<w/2-.5;wx+=2.2) {
          for(const side of [-1,1]){
            centerBox(x+wx,y+1.6+f*3.4,z+side*(d/2+.1),1.2,1.4,.2,COLORS.glow,2);
            centerBox(x+wx,y+1.5+f*3.4,z+side*(d/2+.3),.2,1.6,.2,wood);
            centerBox(x+wx,y+2.2+f*3.4,z+side*(d/2+.3),1.4,.2,.2,wood);
          }
        }
        centerBox(x,y+3.6+f*3.4,z,w+.6,.4,d+.6,wood);
        if(f<floors-1)roof(x,y+3.8+f*3.4,z,w+1.8,d+1.8,1);
      }
      centerBox(x,y+.6,z+d/2+.2,1.6,2.4,.2,wood);
      roof(x,y+h+.8,z,w+2.4,d+2.4,2.2+(w>12?.8:0));
      if(royal)for(const sx of [-1,1]){centerBox(x+sx*(w/2+1),y+1,z+d/2+1,.4,3,.4,COLORS.red);centerBox(x+sx*(w/2+1),y+3,z+d/2+1,.8,.8,.8,COLORS.glow,2);}
    }
    // 八种真实平面与轮廓：开敞院落、曲尺厢房、挑檐商铺等采用不同构造。
    const dwellingNames=['青瓦民居','马头墙宅','沿街商铺','围合院落','吊脚木楼','曲尺小院','重檐楼馆','山间粮仓'];
    const palettes=[
      [0xdcd5bb,0x71533d,0x3b5651,0x72816c],
      [0xc6b18f,0x83563e,0x5b6250,0x879078],
      [0xe6e2d1,0x514a40,0x354747,0x667a70],
      [0xb69973,0x704934,0x715947,0x9b8060],
      [0xc7cbb8,0x634b3a,0x2d5147,0x69816a]
    ];
    function dwelling(lot) {
      const {x,z,y,w,d,type,turn,floors,scheme,level}=lot;
      const [plaster,timber,tile,ridge]=palettes[scheme].map(hex),storey=2.6+level*.2;
      const rotate=(lx,lz)=>turn===0?[lx,lz]:turn===1?[-lz,lx]:turn===2?[-lx,-lz]:[lz,-lx];
      const part=(lx,ly,lz,ww,hh,dd,c,k=0)=>{const p=rotate(lx,lz);centerBox(x+p[0],y+ly,z+p[1],turn%2?dd:ww,hh,turn%2?ww:dd,c,k);};
      function tiles(lx,ly,lz,ww,dd,rise,shape='gable',axis=0,color=tile){
        const n=Math.round(rise/V);
        for(let i=0;i<n;i++){
          const shrink=i*(shape==='hip'?.48:.58),rw=shape==='hip'||axis===1?Math.max(.8,ww-shrink):ww,rd=shape==='hip'||axis===0?Math.max(.8,dd-shrink):dd;
          part(lx,ly+i*V,lz,rw,V,rd,color);
        }
        part(lx,ly+rise,lz,axis===0?Math.max(.6,ww-(shape==='hip'?n*.48:.4)):.6,.4,axis===0?.6:Math.max(.6,dd-(shape==='hip'?n*.48:.4)),ridge);
        if(shape==='hip')for(const sx of [-1,1])for(const sz of [-1,1])for(let i=0;i<3;i++)part(lx+sx*(ww/2-.4+i*.2),ly+i*.2,lz+sz*(dd/2-.4+i*.2),.6,.2,.6,color);
      }
      function window(lx,ly,lz,ww=1,hh=1.2,side=false){
        part(lx,ly,lz,side?.2:ww,hh,side?ww:.2,COLORS.glow,2);
        part(lx,ly-.2,lz+.2,side?.4:ww+.4,.2,side?ww+.4:.2,timber);
        part(lx,ly,lz+.2,.2,hh,side?ww:.2,timber);
        if(!side)part(lx,ly+hh*.5,lz+.2,ww,.2,.2,timber);
      }
      function room(lx,lz,ww,dd,height,wall=plaster){
        part(lx,.4,lz,ww,height,dd,wall);
        for(const sx of [-1,1])for(const sz of [-1,1])part(lx+sx*(ww/2-.2),.4,lz+sz*(dd/2-.2),.4,height,.4,timber);
        part(lx,height+.2,lz,ww+.4,.4,dd+.4,timber);
        if(type!==7)for(let f=0;f<Math.ceil(height/storey);f++)for(const side of [-1,1]){
          const wy=1.2+f*storey;
          part(lx+side*(ww/2+.1),wy,lz,.2,1.2,1.2,COLORS.glow,2);part(lx+side*(ww/2+.3),wy,lz,.2,1.2,.2,timber);
          part(lx+side*ww*.22,wy,lz-dd/2-.1,.8,1+.2*(scheme%2),.2,COLORS.glow,2);
          part(lx+side*ww*.22,wy+.4,lz-dd/2-.3,.8,.2,.2,timber);
        }
      }
      const start=boxes.length/10;
      if(type===3||type===5){
        const hallDepth=3,wingWidth=2.4,h=storey;
        part(0,0,0,w+.6,.4,d+.6,COLORS.stone);
        room(0,-d/2+hallDepth/2,w,hallDepth,h);
        tiles(0,h+.6,-d/2+hallDepth/2,w+1,4,1.6,'gable');
        const wingDepth=d-hallDepth+.2,wingZ=hallDepth/2;
        for(const side of type===3?[-1,1]:[1]){
          room(side*(w/2-wingWidth/2),wingZ,wingWidth,wingDepth,h-.4);
          tiles(side*(w/2-wingWidth/2),h+.2,wingZ,3.2,wingDepth+.6,1.2,'gable',1);
          window(side*(w/2-wingWidth/2),1.1,d/2+.1,.8,1);
        }
        const yardWidth=type===3?w-4.8:w-2.4,doorX=type===3?0:-1.2;
        for(const side of [-1,1])part(doorX+side*(yardWidth/4+1),.4,d/2+.2,Math.max(.8,yardWidth/2-1.2),1.6,.4,plaster);
        for(const side of [-1,1])part(doorX+side*.9,.4,d/2+.2,.4,2.6,.6,timber);part(doorX,2.8,d/2+.2,2.4,.2,1,COLORS.roof);
        window(-1.6,1.2,-d/2+hallDepth+.1);window(1.4,1.2,-d/2+hallDepth+.1);
        part(type===3?0:-1.6,.4,.8,1.2,.6,1.2,COLORS.stone);
        part(type===3?0:-1.6,1,.8,.4,2,.4,COLORS.trunk);part(type===3?0:-1.6,2.4,.8,2,.8,2,COLORS.leaf);
      }else if(type===4){
        const deck=1.6+level*.2,h=storey*floors;
        for(const sx of [-1,1])for(const sz of [-1,1]){
          const p=rotate(sx*(w/2-.4),sz*(d/2-.4)),ground=heightAt(x+p[0],z+p[1]);
          part(sx*(w/2-.4),ground-y,sz*(d/2-.4),.6,Math.max(.4,y+deck-ground),.6,timber);
        }
        part(0,deck,0,w+1.6,.4,d+1.8,timber);part(0,deck+.4,0,w,h,d,hex(0x9e7953));
        part(0,deck+.8,d/2+.7,w+1.6,.4,.2,timber);part(0,deck+1.6,d/2+.7,w+1.6,.2,.2,timber);
        for(let px=-w/2-.4;px<=w/2+.4;px+=.8)part(px,deck+.4,d/2+.7,.2,1.2,.2,timber);
        for(let f=0;f<floors;f++){window(-w*.23,deck+1.2+f*storey,d/2+.1);window(w*.22,deck+1.2+f*storey,d/2+.1);}
        for(const side of [-1,1])part(side*(w/2+.1),deck+1.2,0,.2,1.2,1.4,COLORS.glow,2);
        for(let f=0;f<floors;f++)for(const side of [-1,1]){part(side*w*.23,deck+1.2+f*storey,-d/2-.1,1.2,1.2,.2,COLORS.glow,2);part(side*w*.23,deck+1.6+f*storey,-d/2-.3,1.2,.2,.2,timber);}
        tiles(0,deck+h+.6,0,w+2,d+2,2.0,'gable',scheme%2);
        for(let i=0;i<5;i++)part(-w/2+.6,.4+i*.4,d/2+1-i*.2,1.2,.4,.4,timber);
      }else if(type===6){
        part(0,0,0,w+.6,.6,d+.6,COLORS.stone);
        for(let f=0;f<floors;f++){
          const ww=w-f*.4,dd=d-f*.4,base=.6+f*(storey+1.2);
          part(0,base,0,ww,storey,dd,scheme===2?plaster:COLORS.wall);
          for(const sx of [-1,1])for(const sz of [-1,1])part(sx*(ww/2-.3),base,sz*(dd/2-.3),.4,storey,.4,COLORS.red);
          window(-ww*.24,base+1,dd/2+.1,1.2,1.4);window(ww*.24,base+1,dd/2+.1,1.2,1.4);
          tiles(0,base+storey,0,ww+1.6,dd+1.6,1.4,'hip');
        }
        part(0,.6,d/2+.2,1.4,2.2,.2,timber);
      }else{
        const height=storey*floors,wall=type===7?hex(0x9c815f):plaster;
        part(0,0,0,w+.6,.4,d+.6,COLORS.stone);room(0,0,w,d,height,wall);
        for(let f=0;f<floors;f++){
          const wy=.4+f*storey;
          if(type===2&&f===0){
            part(0,wy+.4,d/2+.1,w-1,1.8,.2,timber);part(-w*.22,wy+.8,d/2+.3,1.2,1.2,.2,COLORS.glow,2);
            part(0,wy+2.1,d/2+.5,w+1,.2,1.2,hex([0x9b4b3c,0x797454,0xba915b][scheme%3]));
            part(0,wy+2.7,d/2+.2,w*.7,.8,.2,timber);
            for(let k=0;k<3;k++){part(-w*.2+k*.8,wy+2.9,d/2+.4,.4,.4,.2,COLORS.gold);part(-w*.3+k*.8,.4,d/2+.7,.6,.6,.6,hex(k%2?0x986348:0xa49b67));}
          }else{
            window(-w*.23,wy+1,d/2+.1,type===1?.8:1.2,type===1?1.4:1.2);
            if(type!==7)window(w*.23,wy+1,d/2+.1,type===1?.8:1,1.2);
          }
          if(f>0)part(0,wy,0,w+.2,.2,d+.2,timber);
        }
        const doorX=(scheme%3-1)*.6;
        part(doorX,.4,d/2+.2,1.2,2,.2,timber);
        const rise=type===7?1.4:1.6+level*.2,axis=type===1?1:scheme%2;
        tiles(0,height+.6,0,w+1.4,d+1.4,rise,'gable',axis,type===7?hex(0x927b51):tile);
        if(type===1){
          for(const side of [-1,1])for(let k=0;k<3;k++){
            const dd=Math.max(1.2,d-k*2.2),base=height+.4+k*.6;
            part(side*(w/2+.1),base,0,.4,.6,dd,plaster);part(side*(w/2+.1),base+.6,0,.6,.2,dd+.4,COLORS.stone);
          }
        }
        if(type===0&&floors===1&&scheme%2===0){part(-w*.26,.4,d/2+.4,2.2,.4,.6,COLORS.stone);}
        if(type===2){for(const side of [-1,1])part(side*(w/2-.2),.4,d/2+1,.2,2.2,.2,timber);}
        if(type===7)for(let k=-w/2+.6;k<w/2;k+=.8)part(k,.6,d/2+.2,.2,height-.4,.2,timber);
      }
      buildings++;const name=dwellingNames[type];buildingTypes[name]=(buildingTypes[name]||0)+1;
      lots.push({...lot,name,firstSolid:start,lastSolid:boxes.length/10});
    }
    function pavilion(x,z,y,w=8) {
      centerBox(x,y,z,w+2,.6,w+2,COLORS.stone);
      for(const sx of [-1,1])for(const sz of [-1,1])centerBox(x+sx*(w/2-1),y+.6,z+sz*(w/2-1),.6,4.4,.6,COLORS.red);
      for(const s of [-1,1]){centerBox(x,y+1.2,z+s*(w/2-1),w-2,.4,.4,COLORS.wood);centerBox(x+s*(w/2-1),y+1.2,z,.4,.4,w-2,COLORS.wood);}
      roof(x,y+4.8,z,w+2.2,w+2.2,3);
      centerBox(x,y+8,z,.6,1.2,.6,COLORS.gold);
    }
    progress('营造疏密街坊、合院与吊脚木楼…');
    let layoutSeed=739123;
    function lr(){layoutSeed^=layoutSeed<<13;layoutSeed^=layoutSeed>>>17;layoutSeed^=layoutSeed<<5;return(layoutSeed>>>0)/4294967296;}
    const lanes=[tourPoints,...streets],allSegments=[];
    for(const lane of lanes)for(let i=1;i<lane.length;i++)allSegments.push({a:lane[i-1],b:lane[i],main:lane===tourPoints});
    function nearestLane(x,z){
      let best={distance:Infinity};
      for(const {a,b} of allSegments){const dx=b[0]-a[0],dz=b[2]-a[2],t=clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1),0,1),px=mix(a[0],b[0],t),pz=mix(a[2],b[2],t),distance=Math.hypot(x-px,z-pz);if(distance<best.distance)best={distance,x:px,z:pz};}
      return best;
    }
    function crossesLot(a,b,x,z,hx,hz,margin=0){
      let enter=0,leave=1;
      for(const [origin,delta,center,half] of [[a[0],b[0]-a[0],x,hx+margin],[a[2],b[2]-a[2],z,hz+margin]]){
        if(Math.abs(delta)<1e-8){if(Math.abs(origin-center)>half)return false;continue;}
        const t0=(center-half-origin)/delta,t1=(center+half-origin)/delta;enter=Math.max(enter,Math.min(t0,t1));leave=Math.min(leave,Math.max(t0,t1));if(enter>leave)return false;
      }
      return true;
    }
    const clearings=[[47,83,7,6],[-15,59,6,4],[69,32,7,5]];
    const clusters=[[[41,96,23],[90,75,22],[-14,66,22],[-82,94,15],[65,53,19],[8,104,17]],[[41,22,23],[78,33,17],[-28,14,18],[-73,20,16]],[[-45,-16,17],[10,-28,17],[18,-4,13]],[]];
    const dimensions=[[5.2,8.2,4.8,7.2],[5.4,7.8,5.2,8],[4.2,6.2,5.8,8],[9.2,12,8.8,11.2],[5.6,7.6,5,7],[8,10,7.6,9.6],[6.2,8.6,5.8,7.4],[4,5.6,4.8,6.6]];
    function place(x,z,region,rural=false,forcedType=null){
      x=q(x);z=q(z);const near=nearestLane(x,z);
      if(near.distance>22&&!rural||near.distance<3)return false;
      if(z>-26&&Math.abs(x-riverX(z))<13)return false;
      if(z<-36&&z>-76&&x>-60&&x<19||x>32&&x<107&&z>-81&&z<-14)return false;
      if(x>7&&x<33&&z>105||Math.abs(x+100)<9&&z>105||Math.abs(x-124)<9&&z>105)return false;
      if(clearings.some(([cx,cz,rx,rz])=>(x-cx)**2/rx**2+(z-cz)**2/rz**2<1))return false;
      const draw=lr(),waterSide=z>-26&&Math.abs(x-riverX(z))<33;
      let type=rural?(draw<.48?4:draw<.75?7:draw<.88?0:5):waterSide?(draw<.50?4:draw<.76?0:draw<.90?2:5):region===0?(draw<.24?0:draw<.43?2:draw<.61?1:draw<.75?3:draw<.88?5:draw<.97?6:7):(draw<.27?1:draw<.47?0:draw<.66?3:draw<.8?5:draw<.95?6:2);
      if(forcedType!==null)type=forcedType;
      const dim=dimensions[type],w=q(mix(dim[0],dim[1],lr())),d=q(mix(dim[2],dim[3],lr()));
      const dx=near.x-x,dz=near.z-z,turn=Math.abs(dx)>Math.abs(dz)?dx>0?3:1:dz>0?0:2;
      const ex=type===4||type===6?2.2:type===3||type===5?1.2:1.6,ez=type===4?2.4:type===6||type===2?2.2:1.6;
      const fx=(turn%2?d+ez:w+ex)/2,fz=(turn%2?w+ex:d+ez)/2;
      if(!rural){const district=districts[region];if(x-fx<district.x0||x+fx>district.x1||z-fz<district.z0||z+fz>district.z1)return false;}
      if(allSegments.some(s=>crossesLot(s.a,s.b,x,z,fx,fz,s.main?2:.4)))return false;
      if(lots.some(l=>Math.abs(l.x-x)<l.fx+fx+.2&&Math.abs(l.z-z)<l.fz+fz+.2))return false;
      const heights=[heightAt(x,z),heightAt(x-fx+.8,z-fz+.8),heightAt(x+fx-.8,z-fz+.8),heightAt(x-fx+.8,z+fz-.8),heightAt(x+fx-.8,z+fz-.8)];
      if(Math.max(...heights)-Math.min(...heights)>(type===4?9:5.2))return false;
      const y=q(type===4?Math.max(...heights):heights[0]),floors=type===3||type===5||type===7?1:type===6?lr()>.65?3:2:type===2?2:lr()>.58?2:1,scheme=Math.floor(lr()*palettes.length),level=Math.floor(lr()*4);
      if(type!==4)pad(x,z,w+.8,d+.8,y);
      dwelling({x,z,y,w,d,type,turn,floors,scheme,level,fx,fz,rural});
      // 门前短巷接入最近街道，不在主游览线上放置额外实体。
      if(near.distance<18){const front=turn===0?[0,fz]:turn===1?[-fx,0]:turn===2?[0,-fz]:[fx,0],a=[x+front[0],heightAt(x+front[0],z+front[1]),z+front[1]],b=[near.x,heightAt(near.x,near.z),near.z];
        if(!lots.slice(0,-1).some(l=>crossesLot(a,b,l.x,l.z,l.fx,l.fz,.2)))stampRoad(a,b,.8,false);
      }
      return true;
    }
    for(let region=0;region<3;region++){
      const district=districts[region],target=[120,53,28][region];let placed=0;
      for(const type of region<2?[3,3,3,6,5,5]:[3,6])for(let attempt=0;attempt<600;attempt++){
        if(place(mix(district.x0,district.x1,lr()),mix(district.z0,district.z1,lr()),region,false,type)){placed++;break;}
      }
      for(let attempt=0;attempt<9000&&placed<target;attempt++){
        let x,z;
        if(lr()<.62){const group=clusters[region][Math.floor(lr()*clusters[region].length)],angle=lr()*Math.PI*2,r=Math.pow(lr(),.7)*group[2];x=group[0]+Math.cos(angle)*r;z=group[1]+Math.sin(angle)*r*.8;}
        else{x=mix(district.x0,district.x1,lr());z=mix(district.z0,district.z1,lr());}
        if(place(x,z,region))placed++;
      }
      await yieldWork();
    }
    // 坡地村落同样检查占地，选择吊脚支承而非等高矩形地台。
    let ruralCount=0;
    for(let i=0;i<2400&&ruralCount<68;i++){
      const x=-158+lr()*322,z=-32+lr()*172;
      if(districts.some(d=>x>d.x0-5&&x<d.x1+5&&z>d.z0-5&&z<d.z1+5)||heightAt(x,z)>64)continue;
      if(place(x,z,0,true))ruralCount++;
    }
    // 主城外墙、垛口、城楼。
    const wallSegments=[[-100,30,-100,115],[-100,115,124,115],[124,115,124,34]];
    for(const [x0,z0,x1,z1]of wallSegments){const len=Math.hypot(x1-x0,z1-z0);for(let s=0;s<len;s+=2){const t=s/len,x=mix(x0,x1,t),z=mix(z0,z1,t);if(Math.abs(x-20)<6&&z>110||z>-26&&Math.abs(x-riverX(z))<9)continue;const y=heightAt(x,z);centerBox(x,y,z,2.4,5.2,2.4,COLORS.stone);centerBox(x,y+5.2,z,1.2,1.2,1.2,COLORS.stone);}}
    pad(20,116,16,10,12);
    for(const s of [-1,1])centerBox(20+s*5.6,12,116,4,7.2,8,COLORS.stone);
    centerBox(20,18.4,116,16,.8,8,COLORS.stone);house(20,116,19.2,14,8,2,true);
    for(const x of [-100,124])house(x,114,heightAt(x,114),9,9,2,true);
    // 上城殿群与开放中轴院落。
    pad(-21,-55,25,15,68.4);house(-21,-55,68.4,22,12,2,true);house(-44,-51,68.4,8,10,1,true);house(2,-51,68.4,8,10,1,true);
    // 标志性观澜阁：七层退台，依崖而立，与两级瀑布并置。
    const towerX=82,towerZ=-42,towerY=52.8;
    centerBox(towerX,towerY,towerZ,22,1.2,22,COLORS.stone);
    for(let floor=0;floor<7;floor++){
      const w=16-floor*1.4,y=towerY+1.2+floor*5.4;
      centerBox(towerX,y,towerZ,w,3.4,w,COLORS.wall);
      for(const s of [-1,1]){
        centerBox(towerX+s*(w/2-.3),y,towerZ,.6,3.6,w,COLORS.red);
        centerBox(towerX,y,towerZ+s*(w/2-.3),w,3.6,.6,COLORS.red);
        for(let a=-w/2+1.4;a<w/2-1;a+=2.4){centerBox(towerX+a,y+1,towerZ+s*(w/2+.1),1.2,1.6,.2,COLORS.glow,2);centerBox(towerX+s*(w/2+.1),y+1,towerZ+a,.2,1.6,1.2,COLORS.glow,2);}
      }
      roof(towerX,y+3.4,towerZ,w+3,w+3,2.2,COLORS.roof);
    }
    centerBox(towerX,towerY+40.4,towerZ,.8,2.6,.8,COLORS.gold);
    landmarks.push({name:'观澜阁',x:82,y:96,z:-42});
    const peakY=heightAt(-68,-111);pad(-68,-111,11,11,peakY);pavilion(-68,-111,peakY,9);landmarks.push({name:'揽云亭',x:-68,y:peakY+11,z:-111});
    pavilion(132,-99,heightAt(132,-99),7);pavilion(-142,-47,heightAt(-142,-47),7);
    pavilion(-84,64,heightAt(-84,64),6);pavilion(29,-20,48,6);
    // 水道与瀑布均由网格对齐的薄体素实体组成。
    for(let z=-24;z<192;z+=.8)centerBox(q(riverX(z)),2.2,q(z),12,.2,1.2,COLORS.water,1);
    for(let z=-41;z<-15;z+=.8){const dz=z+28,w=2*19*Math.sqrt(Math.max(0,1-dz*dz/(14*14)));if(w>.5)centerBox(51,12,z,w,.2,1,COLORS.water,1);}
    centerBox(51,95,-63,11.6,.2,16,COLORS.water,1);
    centerBox(51,53,-49,12,.2,13,COLORS.water,1);
    for(const fall of [{y:53,h:42.2,z:-54.8,w:11.6},{y:12.2,h:40.8,z:-41.8,w:12.4}]){
      centerBox(51,fall.y,fall.z,fall.w,fall.h,.4,COLORS.whitewater,4);
      for(let k=0;k<28;k++){const x=51+(rand()-.5)*fall.w,y=fall.y+rand()*fall.h;centerBox(x,y,fall.z+.4,.2+Math.floor(rand()*3)*.2,1.2+Math.floor(rand()*8)*.2,.4,COLORS.whitewater,4);}
      for(let k=0;k<30;k++){const x=51+(rand()-.5)*(fall.w+4),z=fall.z+rand()*3;centerBox(x,fall.y+rand()*1.6,z,.4,.4,.4,COLORS.whitewater,4);}
    }
    // 瀑潭出水由落差石阶连入主溪。
    for(let i=0;i<100;i++){const t=i/99,x=mix(47,riverX(-10),t),z=mix(-17,-10,t),y=mix(12,2.2,t);centerBox(x,y,z,3,.2,1.6,COLORS.water,1);}
    progress('栽植山林，合并体素外表面…');
    for(let i=0;i<1450;i++) {
      const x=-185+rand()*370,z=-185+rand()*354;
      if(districts.some(d=>x>d.x0-3&&x<d.x1+3&&z>d.z0-3&&z<d.z1+3)||roadDistance(x,z)<5||x>33&&x<105&&z>-80&&z<-17||z>-26&&Math.abs(x-riverX(z))<12)continue;
      if(lots.some(l=>Math.abs(x-l.x)<l.fx+2.5&&Math.abs(z-l.z)<l.fz+2.5))continue;
      const y=heightAt(x,z);if(y>141||y<4)continue;
      const h=3+Math.floor(rand()*18)*V,green=COLORS.leaf.map((c,k)=>c*(.82+rand()*.3));
      centerBox(x,y,z,.4,h,.4,COLORS.trunk);
      for(let layer=0;layer<4;layer++){const w=q(4.8-layer*.8);centerBox(x,y+h-1+layer*.8,z,w,.8,w,green);}
    }
    // 地形贪心网格化：仅保留外表面，合并相邻同高同材质体素。
    const mesh=new Writer(), used=new Uint8Array(N*N);
    const topColors=[COLORS.grass,COLORS.stone,COLORS.road,COLORS.rock,hex(0x889188)];
    for(let z=0;z<N;z++){
      for(let x=0;x<N;x++) {
        const idx=z*N+x;if(used[idx])continue;const h=H[idx],m=M[idx];let w=1,d=1;
        while(x+w<N&&!used[idx+w]&&H[idx+w]===h&&M[idx+w]===m)w++;
        outer:while(z+d<N&&d<160){for(let k=0;k<w;k++){const p=(z+d)*N+x+k;if(used[p]||H[p]!==h||M[p]!==m)break outer;}d++;}
        for(let r=0;r<d;r++)used.fill(1,(z+r)*N+x,(z+r)*N+x+w);
        const x0=x*V-HALF,z0=z*V-HALF,x1=(x+w)*V-HALF,z1=(z+d)*V-HALF,y=h*V;
        mesh.quad([x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],[0,1,0],topColors[m]);
      }
      if(z%240===0)await yieldWork();
    }
    const rock=hex(0x646e60);
    for(let z=0;z<=N;z++) {
      let x=0;while(x<N){const a=z<N?H[z*N+x]:0,b=z>0?H[(z-1)*N+x]:0;if(a===b){x++;continue;}let w=1;while(x+w<N&&(z<N?H[z*N+x+w]:0)===a&&(z>0?H[(z-1)*N+x+w]:0)===b)w++;
        const x0=x*V-HALF,x1=(x+w)*V-HALF,zz=z*V-HALF,lo=Math.min(a,b)*V,hi=Math.max(a,b)*V;
        mesh.quad([x0,lo,zz],[x0,hi,zz],[x1,hi,zz],[x1,lo,zz],[0,0,a>b?-1:1],rock);x+=w;}
      if(z%480===0)await yieldWork();
    }
    for(let x=0;x<=N;x++) {
      let z=0;while(z<N){const a=x<N?H[z*N+x]:0,b=x>0?H[z*N+x-1]:0;if(a===b){z++;continue;}let d=1;while(z+d<N&&(x<N?H[(z+d)*N+x]:0)===a&&(x>0?H[(z+d)*N+x-1]:0)===b)d++;
        const z0=z*V-HALF,z1=(z+d)*V-HALF,xx=x*V-HALF,lo=Math.min(a,b)*V,hi=Math.max(a,b)*V;
        mesh.quad([xx,lo,z0],[xx,hi,z0],[xx,hi,z1],[xx,lo,z1],[a>b?-1:1,0,0],rock);z+=d;}
      if(x%480===0)await yieldWork();
    }
    centerBox(0,-2,0,384,2,384,hex(0x5a7770));
    // 远山同样由网格对齐的实体体素合并而成，延续主场景的空间尺度。
    centerBox(0,-4,0,1600,2,1600,hex(0x708b80));
    for(const [cx,cz,height,radius] of [[-280,-250,130,86],[-118,-306,162,97],[72,-318,147,93],[254,-279,168,95],[-291,-65,89,76],[302,-54,105,82]]){
      const step=4.8,extent=Math.ceil(radius*1.35/step);
      for(let iz=-extent;iz<extent;iz++){
        let ix=-extent;while(ix<extent){
          const value=k=>{const dx=(k+.5)*step,dz=(iz+.5)*step;return q(Math.round((height*Math.exp(-2.2*(dx*dx/(radius*radius)+dz*dz/(radius*radius*.7)))+Math.sin(dx*.047+dz*.022)*3)/2.4)*2.4);};
          const h=value(ix);let width=1;while(ix+width<extent&&value(ix+width)===h)width++;
          if(h>1)box(cx+ix*step,-2,cz+iz*step,width*step,h,step,hex(0x748d84),3);ix+=width;
        }
      }
    }
    const route=[];let routeLength=0;
    for(let k=1;k<tourPoints.length;k++){
      const a=tourPoints[k-1],b=tourPoints[k],len=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
      route.push({a,b,start:routeLength,length:len});routeLength+=len;
    }
    function routeAt(distance){distance=clamp(distance,0,routeLength);const s=route.find(s=>distance<=s.start+s.length)||route.at(-1),t=clamp((distance-s.start)/s.length,0,1);const p=s.a.map((v,i)=>mix(v,s.b[i],t));p[1]=Math.max(p[1],heightAt(p[0],p[2]))+2.2;return p;}
    return {voxel:V,size:SIZE,H,M,terrain:mesh.finish(),instances:new Float32Array(boxes),heightAt,routeAt,routeLength,tourPoints,landmarks,buildings,buildingTypes,lots,streets,seed:182713};
  }
  const api={create,V,SIZE,N,q,groundBase,tourPoints,segmentDistance};root.YSWorld=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
