// 使用 Node.js 标准断言检查真实生成数据，不需要安装测试框架。
const assert=require('node:assert/strict');
const generator=require('./world.js');
(async()=>{
  const w=await generator.create();
  assert.equal(w.voxel,.2);
  assert.equal(w.H.length,1920*1920);
  assert(w.buildings>=180,'山城应有足够的建筑密度');
  assert.equal(Object.keys(w.buildingTypes).length,9,'八类民居和殿阁城楼应同时出现在场景中');
  assert(w.buildingTypes['围合院落']>=6&&w.buildingTypes['重檐楼馆']>=6,'较大的建筑类型应有足够的可见数量');
  assert.equal(new Set(w.lots.map(l=>l.turn)).size,4,'建筑朝向应随街巷变化');
  const rowCounts=new Map();
  for(const l of w.lots.filter(l=>!l.rural)){const key=Math.round(l.z/.2);rowCounts.set(key,(rowCounts.get(key)||0)+1);}
  assert(Math.max(...rowCounts.values())<=4,'民居不应恢复成等距行列');
  for(let i=0;i<w.lots.length;i++)for(let j=i+1;j<w.lots.length;j++){
    const a=w.lots[i],b=w.lots[j];assert(Math.abs(a.x-b.x)>=a.fx+b.fx+.199||Math.abs(a.z-b.z)>=a.fz+b.fz+.199,'建筑占地不能相互重叠');
  }
  const a=w.instances;
  let maxGridError=0;
  for(let i=0;i<a.length;i+=10)for(let k=0;k<3;k++){
    assert(a[i+3+k]>0,'实体尺寸必须为正');
    for(const sign of [-1,1]){const v=(a[i+k]+sign*a[i+3+k]/2)/w.voxel;maxGridError=Math.max(maxGridError,Math.abs(v-Math.round(v)));}
  }
  assert(maxGridError<.001,'实体表面必须对齐 0.2 米网格');
  const t=w.terrain;for(let i=0;i<t.length;i+=9)for(let k=0;k<3;k++){const v=t[i+k]/.2;assert(Math.abs(v-Math.round(v))<.001,'地形表面网格错位');}
  const collisions=[];let minimumClearance=1e9;
  for(let distance=0;distance<=w.routeLength;distance+=.4){const p=w.routeAt(distance);minimumClearance=Math.min(minimumClearance,p[1]-w.heightAt(p[0],p[2]));
    for(let i=0;i<a.length;i+=10){if(a[i+9]!==0)continue;if(Math.abs(p[0]-a[i])<a[i+3]/2+.12&&Math.abs(p[2]-a[i+2])<a[i+5]/2+.12&&p[1]>a[i+1]-a[i+4]/2&&p[1]<a[i+1]+a[i+4]/2){if(collisions.length<10)collisions.push({distance:Number(distance.toFixed(1)),p,box:Array.from(a.slice(i,i+6))});break;}}
  }
  assert(minimumClearance>=2.199,'漫游路线不能穿入地面');
  assert.equal(collisions.length,0,'漫游视线被实体阻挡：'+JSON.stringify(collisions));
  const p=w.routeAt(w.routeLength);assert(Math.abs(p[0]+68)<.001&&Math.abs(p[2]+111)<.001,'漫游终点应为揽云亭');
  console.log(JSON.stringify({passed:true,voxel:w.voxel,buildings:w.buildings,buildingTypes:w.buildingTypes,urbanParcels:w.lots.filter(l=>!l.rural).length,maximumBuildingsInOneRow:Math.max(...rowCounts.values()),terrainTriangles:t.length/27,mergedSolids:a.length/10,routeMetres:Number(w.routeLength.toFixed(1)),minimumEyeClearance:Number(minimumClearance.toFixed(2)),maximumGridError:maxGridError},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
