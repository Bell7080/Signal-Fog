/* ============================================================
   GameScene.js v0.9.1 — 버그픽스
   ────────────────────────────────────────────────────────────
   수정 목록:
   [BUG1] _initScene(): AmbientLight 중복 생성 제거
          (기존: anonymous AmbientLight + this._ambientLight 두 개 추가)
   [BUG2] _initScene(): pl2 const 선언 누락으로 ReferenceError
   [BUG3] _getMoveRange(): unitType 'machine_gun' 처리 누락
          (WeaponSystem이 'machine_gun'을 할당하지만 'mg'로만 비교)
   [BUG4] _showProceedBtn(): window.hud 미초기화 시 방어 로직 추가
   [BUG5] _syncDepotChip(): maxWater/maxRation=0 나누기 0 방어
   ============================================================ */

const ALLY_COLOR_DEFS = [
  { hex:0x39ff8e, css:'#39ff8e', bg:'rgba(5,40,18,0.94)',  emissive:0x1a7740 },
  { hex:0x38d9f5, css:'#38d9f5', bg:'rgba(3,28,40,0.94)',  emissive:0x0d5566 },
  { hex:0xf5e030, css:'#f5e030', bg:'rgba(36,30,2,0.94)',  emissive:0x665800 },
  { hex:0xff8c40, css:'#ff8c40', bg:'rgba(40,14,4,0.94)',  emissive:0x662000 },
  { hex:0xcc80ff, css:'#cc80ff', bg:'rgba(28,8,40,0.94)',  emissive:0x440066 },
  { hex:0x40ffee, css:'#40ffee', bg:'rgba(3,36,34,0.94)',  emissive:0x0d5550 },
  { hex:0xffe066, css:'#ffe066', bg:'rgba(36,34,4,0.94)',  emissive:0x665520 },
  { hex:0xff66b3, css:'#ff66b3', bg:'rgba(40,4,20,0.94)',  emissive:0x882244 },
  { hex:0x66ff40, css:'#66ff40', bg:'rgba(10,36,3,0.94)',  emissive:0x228800 },
  { hex:0x80c8ff, css:'#80c8ff', bg:'rgba(4,18,36,0.94)',  emissive:0x224466 },
];
const ENEMY_COLOR_DEF = { hex:0xff4444, css:'#ff4444', bg:'rgba(40,4,4,0.94)', emissive:0x882222 };

function _makeSquadLabelSprite(text, textCss, bgCss) {
  const W=160,H=72,cv=document.createElement('canvas');
  cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'),r=14;
  ctx.fillStyle=bgCss;
  ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-r,0);
  ctx.arcTo(W,0,W,r,r); ctx.lineTo(W,H-r);
  ctx.arcTo(W,H,W-r,H,r); ctx.lineTo(r,H);
  ctx.arcTo(0,H,0,H-r,r); ctx.lineTo(0,r);
  ctx.arcTo(0,0,r,0,r); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=textCss; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle=textCss; ctx.font='bold 40px "Share Tech Mono",monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,W/2,H/2);
  const tex=new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
}

function _generateMap() {
  const cols=CONFIG.GRID_COLS, rows=CONFIG.GRID_ROWS;
  const seed=(Math.random()*0xffffff)|0;
  const base=_buildBaseField(cols,rows,seed);
  const ridge=_buildRidgeField(cols,rows,seed^0xdeadbeef);
  const layout=_generateMapFromFields(base,ridge,cols,rows);
  _insertRivers(layout,base,cols,rows);
  return layout;
}

function _calcSpawn(count,side,cols,rows) {
  const result=[],spawnRow=side==='ally'?rows-2:1,step=Math.floor(cols/(count+1));
  for(let i=0;i<count;i++){
    const col=Math.min(step*(i+1),cols-2);
    const id=side==='ally'?(i+1):(CONFIG.SQUAD_COUNT+i+1);
    result.push({id,col,row:spawnRow});
  }
  return result;
}
function _calcObjective(){return{col:Math.floor(CONFIG.GRID_COLS/2),row:Math.floor(CONFIG.GRID_ROWS/2)};}

function _calcCameraParams(tileW,cols,rows) {
  const mapSize=Math.max(cols,rows), maxWorld=mapSize*tileW;
  let distMul,heightMul,fov;
  if      (mapSize<=20){distMul=0.65;heightMul=0.55;fov=55;}
  else if (mapSize<=60){distMul=0.58;heightMul=0.48;fov=60;}
  else if (mapSize<=120){distMul=0.52;heightMul=0.42;fov=65;}
  else                 {distMul=0.46;heightMul=0.36;fov=70;}
  return{camDist:maxWorld*distMul, camHeight:maxWorld*heightMul, fov};
}

class GameScene {
  constructor(container) {
    this.container=container;
    this.renderer=this.scene3d=this.camera=this.controls=this.raycaster=null;
    this.gridMap=null;
    this.squads=[]; this.selectedSquad=null; this.pendingCmds=[];
    this.phase='INPUT';
    this.turnManager=this.comms=this.combat=this.enemyAI=null;
    this.supply=null; this.weapon=null; this.survival=null; this.objective=null;
    this.allyAI=null; this.supplyVehicles=null;
    this.dayNight=null;
    // [BUG1] 조명 참조 명시적 초기화
    this._ambientLight=null; this._pointLight=null;
    this.commandedSquadId=null;
    this._animations=[]; this._lastTime=null; this._mouseDownPos=null;
    this.fog=null; this._fogMeshes={}; this._ghostMeshes={}; this._overlapBadges={};
    this._moveHighlights=[]; this._attackHighlights=[];
    this._DEMO_OBJECTIVE=_calcObjective();
    this._pickerOutsideHandler=(e)=>{const p=document.getElementById('squad-picker');if(p&&!p.contains(e.target))this._hideSquadPicker();};
  }

  init() {
    this._initRenderer();
    this._initScene();
    this._initSystems();
    this._setupInput();
    window.addEventListener('resize',this._onResize.bind(this));
    window.gameScene=this;
    this.turnManager.startInputPhase();
    chatUI.addLog('OC/T',null,'훈련 개시. 목표: 3×3 점령지 탐색 후 점령. 위치는 직접 찾아야 한다.');
    chatUI.addLog('SYSTEM',null,`맵 ${CONFIG.GRID_COLS}×${CONFIG.GRID_ROWS} | 아군 ${CONFIG.SQUAD_COUNT}분대 | 적군 ${CONFIG.ENEMY_COUNT}분대`,'system');
    chatUI.addLog('SYSTEM',null,`점령 게이지: ${this.objective.maxGauge}pt 필요 (${CONFIG.CAPTURE_WIN_TURNS_FACTOR}pt/분대/턴)`,'system');
    chatUI.addLog('SYSTEM',null,'드래그=회전 / 휠=줌 / 우클릭드래그=이동','system');
    this._tick();
  }

  _initRenderer() {
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setClearColor(0x040604,1);
    const w=this.container.clientWidth||window.innerWidth||800;
    const h=this.container.clientHeight||window.innerHeight||600;
    this.renderer.setSize(w,h);
    this.container.appendChild(this.renderer.domElement);
    console.log(`[GameScene] Renderer: ${w}×${h}`);
  }

  _initScene() {
    const w=this.container.clientWidth||window.innerWidth||800;
    const h=this.container.clientHeight||window.innerHeight||600;
    this.scene3d=new THREE.Scene();

    const WORLD=24;
    const tileW=WORLD/Math.max(CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    const {camDist,camHeight,fov}=_calcCameraParams(tileW,CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    console.log(`[GameScene] tileW:${tileW.toFixed(3)} camDist:${camDist.toFixed(2)} camH:${camHeight.toFixed(2)} fov:${fov}`);

    const mapSize=Math.max(CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    const fogDensity=mapSize<=20?0.015:mapSize<=60?0.008:0.004;
    this.scene3d.fog=new THREE.FogExp2(0x040604,fogDensity);

    this.camera=new THREE.PerspectiveCamera(fov,w/h,tileW*0.05,camDist*6);
    this.camera.position.set(0,camHeight,camDist);
    this.camera.lookAt(0,0,0);

    this.controls=null;
    try {
      if(typeof THREE.OrbitControls!=='undefined'){
        this.controls=new THREE.OrbitControls(this.camera,this.renderer.domElement);
        Object.assign(this.controls,{
          target:new THREE.Vector3(0,0,0),enableDamping:true,dampingFactor:0.08,
          minDistance:tileW*2,maxDistance:camDist*3,maxPolarAngle:Math.PI/2.05,screenSpacePanning:true,
        });
      }
    } catch(e){console.warn('[GameScene] OrbitControls 없음:',e.message);}

    const worldSize=mapSize*tileW;

    // ★ [BUG1 FIX] AmbientLight 단 하나만 생성 — 기존 코드의 중복 생성 제거
    this._ambientLight=new THREE.AmbientLight(0x0a2010,1.5);
    this.scene3d.add(this._ambientLight);

    // ★ [BUG1 FIX] PointLight 참조 저장 후 씬 추가 (scene3d.add 누락 방지)
    this._pointLight=new THREE.PointLight(0x39ff8e,1.5,worldSize*4);
    this._pointLight.position.set(0,camHeight*1.5,0);
    this.scene3d.add(this._pointLight);

    // ★ [BUG2 FIX] pl2 const 선언 복구 — 이전 패치에서 선언이 사라짐
    const pl2=new THREE.PointLight(0x2277cc,0.5,worldSize*3);
    pl2.position.set(-worldSize*0.3,camHeight,worldSize*0.3);
    this.scene3d.add(pl2);

    this.raycaster=new THREE.Raycaster();
    this.raycaster.params.Line={threshold:0.01};
  }

  _initSystems() {
    this.gridMap    =new GridMap(this);
    this.comms      =new CommsSystem();
    this.combat     =new CombatSystem();
    this.supply     =new SupplySystem();
    this.weapon     =new WeaponSystem();
    this.survival   =new SurvivalStats();
    this.dayNight   =CONFIG.DAY_NIGHT_ENABLED ? new DayNightCycle() : null;
    this.allyAI     =new AllyAI();
    this.supplyVehicles=new SupplyVehicleSystem();
    this.enemyAI    =new EnemyAI(new GeminiClient(),new FallbackAI());
    this.turnManager=new TurnManager(this);
    const layout=_generateMap();
    this.gridMap.build(layout);
    this.supply.init(this.scene3d,this.gridMap);
    this.supplyVehicles.init(this.scene3d,this.gridMap);
    this.objective=new ObjectiveSystem();
    this.objective.init(this.gridMap,this.scene3d,CONFIG.SQUAD_COUNT);
    this._DEMO_OBJECTIVE=this.objective.center;
    this._initSquads();
    this._initDepots();
    this._initFog();
    this._updateFog();
    if(this.dayNight&&this._ambientLight&&this._pointLight){
      this.dayNight.init({ambient:this._ambientLight,point:this._pointLight,scene:this.scene3d});
    }
  }

  _initFog() {
    this.fog=new FogOfWar(this.gridMap);
    const gm=this.gridMap;
    if(gm._largeMap){
      this._fogMode='canvas'; this._initFogCanvas();
    } else {
      this._fogMode='mesh';
      for(let r=0;r<CONFIG.GRID_ROWS;r++){
        for(let c=0;c<CONFIG.GRID_COLS;c++){
          const h=gm.tiles[r][c].height;
          const wx=c*gm.TILE_W+gm.OFFSET_X;
          const wz=r*gm.TILE_W+gm.OFFSET_Z;
          const mesh=new THREE.Mesh(
            new THREE.PlaneGeometry(gm.TILE_W,gm.TILE_W),
            new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})
          );
          mesh.rotation.x=-Math.PI/2;
          mesh.position.set(wx,h+0.04,wz);
          mesh.renderOrder=3;
          this.scene3d.add(mesh);
          this._fogMeshes[`${c},${r}`]=mesh;
        }
      }
    }
    for(const s of this.squads.filter(q=>q.side==='enemy')){
      const g=_makeTextSprite('?','#882222');
      g.scale.set(gm.TILE_W*1.2,gm.TILE_W*1.2,1);
      g.visible=false; this.scene3d.add(g);
      this._ghostMeshes[s.id]=g;
    }
  }

  _initFogCanvas() {
    const gm=this.gridMap, cols=CONFIG.GRID_COLS, rows=CONFIG.GRID_ROWS;
    const RES=1;
    const canvas=document.createElement('canvas');
    canvas.width=cols*RES; canvas.height=rows*RES;
    this._fogCtx=canvas.getContext('2d');
    this._fogTex=new THREE.CanvasTexture(canvas);
    this._fogResRCP=RES;
    const totalW=cols*gm.TILE_W, totalH=rows*gm.TILE_W;
    const fogPlane=new THREE.Mesh(
      new THREE.PlaneGeometry(totalW,totalH),
      new THREE.MeshBasicMaterial({map:this._fogTex,transparent:true,depthWrite:false,side:THREE.DoubleSide})
    );
    fogPlane.rotation.x=-Math.PI/2;
    fogPlane.position.set(gm.OFFSET_X+totalW/2-gm.TILE_W/2,gm.HEIGHT_MAX+0.05,gm.OFFSET_Z+totalH/2-gm.TILE_W/2);
    fogPlane.renderOrder=3;
    this.scene3d.add(fogPlane);
    this._fogPlane=fogPlane;
  }

  _updateFog() {
    if(!this.fog) return;
    const allies=this.squads.filter(s=>s.side==='ally'&&s.alive);
    this.fog.computeVisible(allies,this.dayNight);
    const gm=this.gridMap;
    if(this._fogMode==='canvas'){
      const ctx=this._fogCtx, RES=this._fogResRCP;
      const cw=ctx.canvas.width, ch=ctx.canvas.height;
      ctx.clearRect(0,0,cw,ch);
      ctx.fillStyle='rgba(0,0,0,0.80)';
      ctx.fillRect(0,0,cw,ch);
      ctx.globalCompositeOperation='destination-out';
      for(const s of allies){
        const cx=(s.pos.col+0.5)*RES, cy=(s.pos.row+0.5)*RES;
        const radius=(CONFIG.FOG_SIGHT_RANGE+0.5)*RES;
        const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
        grad.addColorStop(0,'rgba(0,0,0,1)');
        grad.addColorStop(0.65,'rgba(0,0,0,0.9)');
        grad.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=grad;
        ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
      this._fogTex.needsUpdate=true;
    } else {
      for(let r=0;r<CONFIG.GRID_ROWS;r++)
        for(let c=0;c<CONFIG.GRID_COLS;c++){
          const m=this._fogMeshes[`${c},${r}`];
          if(m) m.material.opacity=this.fog.isVisible(c,r)?0:0.78;
        }
    }
    for(const s of this.squads.filter(q=>q.side==='enemy')){
      const inSight=this.fog.isVisible(s.pos.col,s.pos.row);
      if(s.mesh) s.mesh.visible=s.alive&&inSight;
      const ghost=this._ghostMeshes[s.id]; if(!ghost) continue;
      if(inSight&&s.alive){this.fog.updateLastKnown(s.id,s.pos);ghost.visible=false;}
      else if(s.alive){
        const lk=this.fog.getLastKnown(s.id);
        if(lk){
          const wp=gm.toWorld(lk.col,lk.row);
          ghost.position.set(wp.x,wp.y+gm.TILE_W*0.7,wp.z);
          ghost.visible=true;
        }
      } else{ghost.visible=false;}
    }
  }

  _drawObjective(){}

  _initSquads() {
    const cols=CONFIG.GRID_COLS,rows=CONFIG.GRID_ROWS;
    for(const d of _calcSpawn(CONFIG.SQUAD_COUNT,'ally',cols,rows)){const s=this._makeSquad(d.id,'ally',d.col,d.row);this.squads.push(s);}
    for(const d of _calcSpawn(CONFIG.ENEMY_COUNT,'enemy',cols,rows)){const s=this._makeSquad(d.id,'enemy',d.col,d.row);this.squads.push(s);}
    this.weapon.assignWeapons(this.squads.filter(s=>s.side==='ally'));
    this.weapon.assignWeapons(this.squads.filter(s=>s.side==='enemy'));
    for(const s of this.squads){this.supply.initSquad(s);this.survival.initSquad(s);}
    for(const s of this.squads) this._createMesh(s);
    this._buildSquadPanel(); this._syncPanel(); this._updateOverlapVisuals();
  }

  _initDepots() {
    const cols=CONFIG.GRID_COLS, rows=CONFIG.GRID_ROWS, spawnRow=rows-3;
    const step=Math.floor(cols/3);
    [['food','전투식량 창고'],['water','급수소']].forEach(([type,label],i)=>{
      const col=Math.min(step*(i+1),cols-2);
      const row=Math.max(0,Math.min(rows-1,spawnRow));
      const depot=this.supply.addDepot(col,row,'ally');
      depot.type=type;
      if(type==='food'){depot.water=0;depot.maxWater=0;}
      else             {depot.ration=0;depot.maxRation=0;}
      this.supply.buildDepotMesh(depot);
      const coord=`${String.fromCharCode(65+(col%26))}-${String(row+1).padStart(2,'0')}`;
      chatUI.addLog('SYSTEM',null,`${label}#${depot.id} 설치 — ${coord} (보급 반경 ${CONFIG.SUPPLY_RESUPPLY_RANGE}타일)`,'system');
    });
  }

  _buildSquadPanel() {
    const list=document.getElementById('squad-list'); if(!list) return;
    list.innerHTML='';
    this.squads.filter(s=>s.side==='ally').forEach((squad,i)=>{
      const cd=squad._colDef||this._squadColor(squad);
      const card=document.createElement('div');
      card.className='squad-card'+(i===0?' active':'');
      card.dataset.squadId=squad.id;
      card.style.borderLeft=`3px solid ${cd.css}`;
      const wDef=squad.weaponDef;
      const wBadge=wDef&&wDef.id!=='rifle'?`<span class="weapon-badge" style="color:${wDef.color};border-color:${wDef.color}">${wDef.labelShort}</span>`:'';
      card.innerHTML=`<div class="squad-card-header"><span class="squad-badge" style="color:${cd.css};border-color:${cd.css}">A${squad.id}분대</span>${wBadge}<span class="squad-status-tag">대기</span></div>`+
        `<div class="squad-troops">병력 <span class="troop-val">${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</span> | 이동 <span class="moveap-val">${this._getMoveRange(squad)}칸</span> | AP <span class="ap-val">${squad.ap}/${CONFIG.SQUAD_AP_MAX}</span></div>`+
        `<div class="comms-row"><span class="comms-label">통신</span><div class="stat-bar"><div class="stat-fill" style="width:100%"></div></div><span class="comms-val">100%</span></div>`+
        `<div class="supply-row"><span class="supply-label">물</span><div class="stat-bar"><div class="supply-water-fill stat-fill" style="width:100%"></div></div><span class="supply-val supply-water-val">100%</span></div>`+
        `<div class="supply-row"><span class="supply-label">식량</span><div class="stat-bar"><div class="supply-ration-fill stat-fill" style="width:100%"></div></div><span class="supply-val supply-ration-val">100%</span></div>`+
        `<div class="supply-row"><span class="supply-label">정신</span><div class="stat-bar"><div class="supply-morale-fill stat-fill" style="width:100%"></div></div><span class="supply-val supply-morale-val">100%</span></div>`+
        `<div class="inventory-row"><span class="inv-label">소지</span><span class="inv-val">식량<b class="inv-ration">5</b> 물<b class="inv-water">5</b></span></div>`;
      card.addEventListener('click',()=>this.selectSquadById(squad.id));
      list.appendChild(card);
    });
  }

  _makeSquad(id,side,col,row){
    return{
      id,side,pos:{col,row},troops:CONFIG.SQUAD_TROOP_MAX,ap:CONFIG.SQUAD_AP_MAX,
      terrain:CONFIG.TERRAIN.OPEN,alive:true,mesh:null,mat:null,boxMesh:null,_boxH:0,
      unitType:'rifle',weaponDef:null,mortarState:'moving',mortarCooldown:0,suppressed:false,
      supply:{water:CONFIG.SUPPLY_WATER_MAX,ration:CONFIG.SUPPLY_RATION_MAX},
      _apPenalty:0,sleeping:false,_starveTick:0,
    };
  }
  _squadColor(squad){return squad.side==='enemy'?ENEMY_COLOR_DEF:ALLY_COLOR_DEFS[(squad.id-1)%ALLY_COLOR_DEFS.length];}

  _createMesh(squad) {
    const gm=this.gridMap;
    const wp=gm.toWorld(squad.pos.col,squad.pos.row);
    const cd=this._squadColor(squad);
    const TW=gm.TILE_W;
    const label=squad.side==='ally'?`A${squad.id}`:`E${squad.id-CONFIG.SQUAD_COUNT}`;
    const group=new THREE.Group();
    const bw=TW*0.78,bh=TW*0.52,bd=TW*0.78;
    const geo=new THREE.BoxGeometry(bw,bh,bd);
    const mat=new THREE.MeshLambertMaterial({color:cd.hex,transparent:true,opacity:0.90});
    const box=new THREE.Mesh(geo,mat);
    box.userData={squadId:squad.id};
    group.add(box);
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:cd.hex,transparent:true,opacity:0.9})));
    const mapSize=Math.max(CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    const labelScale=mapSize>60?0.7:1.0;
    const sprite=_makeSquadLabelSprite(label,cd.css,cd.bg);
    sprite.position.set(0,TW*0.95,0);
    sprite.scale.set(TW*1.6*labelScale,TW*0.75*labelScale,1);
    sprite.raycast=()=>{};
    group.add(sprite);
    if(squad.unitType&&squad.unitType!=='rifle'&&squad.weaponDef){
      const wColor=squad.weaponDef.color||cd.css;
      const wShort=squad.weaponDef.labelShort||'??';
      const wSprite=_makeTextSprite(wShort,wColor);
      wSprite.position.set(0,TW*1.55,0);
      wSprite.scale.set(TW*0.9*labelScale,TW*0.5*labelScale,1);
      wSprite.raycast=()=>{};
      group.add(wSprite);
    }
    group.position.set(wp.x,wp.y+bh/2,wp.z);
    group.userData={squadId:squad.id};
    this.scene3d.add(group);
    squad.mesh=group; squad.mat=mat; squad.boxMesh=box;
    squad._colDef=cd; squad._boxH=bh;
  }

  _getSquadsOnTile(col,row,side=null){return this.squads.filter(s=>s.alive&&s.pos.col===col&&s.pos.row===row&&(side===null||s.side===side));}

  _calcOffsets(count){
    const D=this.gridMap.TILE_W*0.5;
    if(count===2)return[{dx:-D,dz:0},{dx:D,dz:0}];
    if(count===3)return[{dx:-D,dz:-D*.5},{dx:D,dz:-D*.5},{dx:0,dz:D*.9}];
    return Array.from({length:count},(_,i)=>({dx:i%2===0?-D:D,dz:(Math.floor(i/2)-(Math.ceil(count/2)-1)/2)*D*1.2}));
  }

  _updateOverlapVisuals() {
    if(!this.scene3d||!this.gridMap) return;
    for(const b of Object.values(this._overlapBadges)){this.scene3d.remove(b);b.material?.map?.dispose();b.material?.dispose();}
    this._overlapBadges={};
    const gm=this.gridMap,TW=gm.TILE_W;
    const _place=(list,showBadge)=>{
      const base=gm.toWorld(list[0].pos.col,list[0].pos.row);
      if(list.length===1){
        list[0].mesh.position.set(base.x,base.y+list[0]._boxH/2,base.z);
      } else {
        const off=this._calcOffsets(list.length);
        list.forEach((s,i)=>s.mesh.position.set(base.x+off[i].dx,base.y+s._boxH/2,base.z+off[i].dz));
        if(showBadge){
          const badge=_makeTextSprite(`×${list.length}`,'#ffb84d');
          badge.position.set(base.x,base.y+TW*1.7,base.z);
          badge.scale.set(TW,TW*0.6,1); badge.renderOrder=10;
          this.scene3d.add(badge);
          this._overlapBadges[`${list[0].pos.col},${list[0].pos.row}`]=badge;
        }
      }
    };
    const allyG={};
    for(const s of this.squads.filter(q=>q.alive&&q.mesh&&q.side==='ally')){const k=`${s.pos.col},${s.pos.row}`;(allyG[k]=allyG[k]||[]).push(s);}
    for(const list of Object.values(allyG)) _place(list,true);
    const enemyG={};
    for(const s of this.squads.filter(q=>q.alive&&q.mesh&&q.side==='enemy')){const k=`${s.pos.col},${s.pos.row}`;(enemyG[k]=enemyG[k]||[]).push(s);}
    for(const list of Object.values(enemyG)) _place(list,false);
  }

  _showSquadPicker(squads,clientX,clientY){
    const picker=document.getElementById('squad-picker'); if(!picker) return;
    this._hideSquadPicker();
    const col=squads[0].pos.col,row=squads[0].pos.row;
    const coord=`${String.fromCharCode(65+(col%26))}-${String(row+1).padStart(2,'0')}`;
    const title=document.createElement('div'); title.className='picker-title';
    title.innerHTML=`<span class="picker-icon">⚡</span> ${coord} 겹침 — 분대 선택`; picker.appendChild(title);
    squads.forEach(squad=>{
      const cd=squad._colDef||this._squadColor(squad);
      const q=this._quality(squad),hasCmd=!!this.pendingCmds.find(c=>c.squadId===squad.id);
      const qColor=q<50?'#ff4444':q<70?'#ffb84d':cd.css;
      const card=document.createElement('div');
      card.className='picker-card'+(this.selectedSquad?.id===squad.id?' picker-card-selected':'');
      card.innerHTML=`<div class="picker-card-stripe" style="background:${cd.css}"></div><div class="picker-card-content"><div class="picker-card-header"><span class="picker-card-name" style="color:${cd.css}">A${squad.id}분대</span>${hasCmd?`<span class="picker-cmd-tag">명령↑</span>`:''}</div><div class="picker-card-row"><span class="picker-stat-item">병력 <b>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</b></span><span class="picker-stat-item">이동 <b>${this._getMoveRange(squad)}칸</b></span><span class="picker-stat-item">AP <b>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</b></span><span class="picker-stat-item" style="color:${qColor}">통신 <b>${q}%</b></span></div></div><div class="picker-card-arrow">▶</div>`;
      card.addEventListener('click',e=>{e.stopPropagation();this._hideSquadPicker();this.selectSquad(squad);});
      picker.appendChild(card);
    });
    const closeBtn=document.createElement('div'); closeBtn.className='picker-close';
    closeBtn.innerHTML='✕&nbsp;&nbsp;닫기';
    closeBtn.addEventListener('click',e=>{e.stopPropagation();this._hideSquadPicker();});
    picker.appendChild(closeBtn);
    const rect=this.container.getBoundingClientRect();
    const PW=224,PH=48+squads.length*76+38;
    picker.style.left=Math.min(clientX-rect.left+14,rect.width-PW-6)+'px';
    picker.style.top=Math.min(clientY-rect.top+14,rect.height-PH-6)+'px';
    picker.style.display='block';
    setTimeout(()=>document.addEventListener('click',this._pickerOutsideHandler),80);
    chatUI.addLog('SYSTEM',null,`⚠ ${coord} — ${squads.length}개 분대 겹침.`,'system');
  }
  _hideSquadPicker(){const p=document.getElementById('squad-picker');if(p){p.style.display='none';p.innerHTML='';}document.removeEventListener('click',this._pickerOutsideHandler);}

  selectSquad(squad){
    if(this.phase!=='INPUT'||!squad.alive) return;
    this._hideSquadPicker(); this._cancelCmd(squad);
    if(this.selectedSquad?.mesh){if(this.selectedSquad.mat){this.selectedSquad.mat.emissive=new THREE.Color(0);this.selectedSquad.mat.opacity=0.90;}this.selectedSquad.mesh.scale.set(1,1,1);}
    this.selectedSquad=squad;
    const cd=squad._colDef||this._squadColor(squad);
    squad.mat.emissive=new THREE.Color(cd.emissive); squad.mat.opacity=1.0; squad.mesh.scale.set(1.25,1.25,1.25);
    this._showMoveTargets(squad); this._syncPanel();
    const pos=`${String.fromCharCode(65+(squad.pos.col%26))}-${String(squad.pos.row+1).padStart(2,'0')}`;
    const cmdInfo=this.commandedSquadId===null?'지휘 가능':this.commandedSquadId===squad.id?'지휘 중':'이번 턴 지휘 완료';
    chatUI.addLog('SYSTEM',null,`A${squad.id}분대 — 위치:${pos} | 이동:${this._getMoveRange(squad)}칸 | AP:${squad.ap}/${CONFIG.SQUAD_AP_MAX} | ${cmdInfo}`,'system');
  }
  selectSquadById(id){const s=this.squads.find(q=>q.side==='ally'&&q.id===id);if(s)this.selectSquad(s);}

  _showProceedBtn(label='진행'){
    const btn=document.getElementById('proceed-btn');
    if(!btn) return;
    btn.textContent=`▶ ${label}`;
    btn.style.display='block';
    // ★ [BUG4 FIX] window.hud 미초기화 방어 + 전역 confirmTurn 폴백
    btn.onclick=()=>{
      this._hideProceedBtn();
      if(window.hud&&typeof window.hud.confirmTurn==='function'){
        window.hud.confirmTurn();
      } else if(typeof confirmTurn==='function'){
        confirmTurn();
      } else if(this.turnManager){
        this.turnManager.confirmInput();
      }
    };
  }
  _hideProceedBtn(){const btn=document.getElementById('proceed-btn');if(btn)btn.style.display='none';}

  // ★ [BUG3 FIX] unitType 'machine_gun' 처리 추가 (WeaponSystem 반환값과 일치)
  _getMoveRange(squad){
    if(!squad) return 0;
    const isMG=squad.unitType==='mg'||squad.unitType==='machine_gun';
    let base=squad.unitType==='mortar'?CONFIG.MORTAR_MOVE:isMG?CONFIG.MG_MOVE:CONFIG.RIFLE_MOVE;
    if(squad.unitType==='mortar'&&squad.mortarState==='ready') base=0;
    if(squad.supply){
      const T=CONFIG.SURVIVAL_MOVE_PENALTY_THRESHOLD;
      if((squad.supply.water??100)<T)  base--;
      if((squad.supply.ration??100)<T) base--;
      if((squad.supply.morale??100)<T) base--;
    }
    return Math.max(0,base);
  }

  _clearBlinkHighlights(){
    for(const m of this._moveHighlights)  {this.scene3d.remove(m);m.material?.dispose();}
    for(const m of this._attackHighlights){this.scene3d.remove(m);m.material?.dispose();}
    this._moveHighlights=[];this._attackHighlights=[];
  }

  _showMoveTargets(squad){
    this._clearBlinkHighlights();
    this.gridMap.clearHighlights();
    const wDef=squad.weaponDef;
    const moveRange=this._getMoveRange(squad);
    const gm=this.gridMap,TW=gm.TILE_W;
    const _mkMesh=(col,row,color)=>{
      const h=gm.tiles[row][col].height;
      const wx=col*TW+gm.OFFSET_X,wz=row*TW+gm.OFFSET_Z;
      const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.2,side:THREE.DoubleSide,depthWrite:false});
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(TW*0.94,TW*0.94),mat);
      mesh.rotation.x=-Math.PI/2;
      mesh.position.set(wx,h+0.016,wz);
      mesh.renderOrder=2;
      this.scene3d.add(mesh);
      return mesh;
    };
    if(moveRange>0&&!squad.sleeping){
      for(let r=0;r<CONFIG.GRID_ROWS;r++)
        for(let c=0;c<CONFIG.GRID_COLS;c++){
          const dist=Math.abs(c-squad.pos.col)+Math.abs(r-squad.pos.row);
          if(dist===0||dist>moveRange) continue;
          this._moveHighlights.push(_mkMesh(c,r,0x39ff8e));
        }
    }
    for(const e of this.squads.filter(q=>q.side==='enemy'&&q.alive)){
      const inRange=wDef?this.weapon.inRange(squad.pos,e.pos,wDef):this.combat.inRange(squad.pos,e.pos);
      if(inRange) this._attackHighlights.push(_mkMesh(e.pos.col,e.pos.row,0xff4444));
    }
    if(squad.unitType==='mortar'&&squad.mortarState==='ready'){
      for(let r=0;r<CONFIG.GRID_ROWS;r++)
        for(let c=0;c<CONFIG.GRID_COLS;c++){
          const dist=Math.abs(c-squad.pos.col)+Math.abs(r-squad.pos.row);
          if(dist>0&&dist<=CONFIG.MORTAR_RANGE) this.gridMap.highlightTile(c,r,0xcc80ff,0.12);
        }
    }
  }

  _clearSelection(){
    if(this.selectedSquad?.mat){this.selectedSquad.mat.emissive=new THREE.Color(0);this.selectedSquad.mat.opacity=0.90;this.selectedSquad.mesh.scale.set(1,1,1);}
    this.selectedSquad=null; this._clearBlinkHighlights(); this.gridMap.clearHighlights(); this._syncPanel();
  }

  _issueMove(squad,targetPos){
    const dist=Math.abs(targetPos.col-squad.pos.col)+Math.abs(targetPos.row-squad.pos.row);
    if(dist===0) return;
    if(squad.sleeping){chatUI.addLog('SYSTEM',null,`A${squad.id}분대 수면 중 — 행동 불가`,'system');return;}
    if(this.commandedSquadId!==null&&this.commandedSquadId!==squad.id){chatUI.addLog('SYSTEM',null,'이번 턴 지휘 완료 — 1개 분대만 직접 지휘 가능','system');return;}
    const moveRange=this._getMoveRange(squad);
    if(moveRange===0){chatUI.addLog('SYSTEM',null,'이동 불가 (거치 상태 또는 체력 저하)','system');return;}
    if(dist>moveRange){chatUI.addLog('SYSTEM',null,`이동 거리 초과(거리:${dist},가능:${moveRange})`,'system');return;}
    if(squad.unitType==='mortar'&&squad.mortarState==='ready'){this.weapon.dismantleMortar(squad);chatUI.addLog(`A${squad.id}`,null,'박격포 거치 해제 — 이동','system');}
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if(this.comms.rollMishear(quality)){
      const res=this.comms.applyMishear({type:'move',squadId:squad.id,targetTile:targetPos,targetPos},this.squads,squad);
      if(res.distorted){
        chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
        if(res.mishearType==='ignore'){chatUI.addLog(`A${squad.id}`,null,'⚡ 명령 미수신 — 대기','system');this._clearSelection();return;}
        if(res.mishearType==='attack_instead'){const target=this.squads.find(s=>s.id===res.command.targetId&&s.alive);if(target&&squad.ap>=1){this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});squad.ap-=1;this.commandedSquadId=squad.id;chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 → E${target.id-CONFIG.SQUAD_COUNT}분대 사격으로 둔갑`);this._clearBlinkHighlights();this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);}else{chatUI.addLog(`A${squad.id}`,null,'⚡ 오청(사격 둔갑) — AP 부족','system');}this._clearSelection();return;}
        if(res.mishearType==='coord'){const dp=res.command.targetTile,dd=Math.abs(dp.col-squad.pos.col)+Math.abs(dp.row-squad.pos.row);if(dd>0&&dd<=moveRange){this.pendingCmds.push({type:'move',squadId:squad.id,targetPos:dp});this.commandedSquadId=squad.id;this._clearBlinkHighlights();this.gridMap.highlightTile(dp.col,dp.row,0xffb84d,0.50);chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 이동 → ${String.fromCharCode(65+(dp.col%26))}-${String(dp.row+1).padStart(2,'0')}`);}else{chatUI.addLog(`A${squad.id}`,null,'⚡ 오청 좌표 이동 불가 → 대기','system');}this._clearSelection();return;}
      }
    }
    this.pendingCmds.push({type:'move',squadId:squad.id,targetPos});
    this.commandedSquadId=squad.id;
    if(this.survival) this.survival.consumeMove(squad);
    this._clearBlinkHighlights(); this.gridMap.clearHighlights(); this.gridMap.highlightTile(targetPos.col,targetPos.row,0x39ff8e,0.50);
    chatUI.addLog(`A${squad.id}`,null,`이동 → ${String.fromCharCode(65+(targetPos.col%26))}-${String(targetPos.row+1).padStart(2,'0')}`);
    this._clearSelection();
    this._showProceedBtn('이동 확정');
  }

  _issueAttack(squad,target){
    if(squad.sleeping){chatUI.addLog('SYSTEM',null,`A${squad.id}분대 수면 중 — 행동 불가`,'system');return;}
    if(this.commandedSquadId!==null&&this.commandedSquadId!==squad.id){chatUI.addLog('SYSTEM',null,'이번 턴 지휘 완료 — 1개 분대만 직접 지휘 가능','system');return;}
    const wDef=squad.weaponDef||{range:CONFIG.RIFLE_RANGE,hitRate:CONFIG.RIFLE_HIT_RATE};
    const maxRange=wDef.range||CONFIG.RIFLE_RANGE;
    if(squad.unitType==='mortar'){
      if(squad.mortarState!=='ready'){
        if(squad.ap<CONFIG.MORTAR_SETUP_COST){chatUI.addLog('SYSTEM',null,'박격포: AP 부족 — 거치 불가','system');return;}
        const res=this.weapon.setupMortar(squad);
        if(res.ok){chatUI.addLog(`A${squad.id}`,null,'박격포 거치 완료 — 다시 클릭하여 사격','system');this._syncPanel();return;}
      }
      if(squad.mortarCooldown>0){chatUI.addLog('SYSTEM',null,`박격포 재장전 중(${squad.mortarCooldown}턴 남음)`,'system');return;}
      if(!this.weapon.inRange(squad.pos,target.pos,wDef)){chatUI.addLog('SYSTEM',null,`사거리 밖(박격포 최대${maxRange}타일)`,'system');return;}
      if(squad.ap<1){chatUI.addLog('SYSTEM',null,'AP 부족 — 사격 불가','system');return;}
      this._cancelCmd(squad);
      this.pendingCmds.push({type:'mortar',squadId:squad.id,targetPos:{col:target.pos.col,row:target.pos.row}});
      squad.ap-=1; squad.mortarCooldown=CONFIG.MORTAR_COOLDOWN;
      this.commandedSquadId=squad.id;
      if(this.survival) this.survival.consumeAttack(squad);
      this._clearBlinkHighlights(); this.gridMap.clearHighlights();
      this.gridMap.highlightTile(target.pos.col,target.pos.row,0xcc80ff,0.55);
      chatUI.addLog(`A${squad.id}`,null,`박격포 사격 → E${target.id-CONFIG.SQUAD_COUNT}분대 위치`);
      this._clearSelection(); this._showProceedBtn('박격포 확정'); return;
    }
    if(!this.weapon.inRange(squad.pos,target.pos,wDef)){chatUI.addLog('SYSTEM',null,`사거리 밖(최대${maxRange}타일)`,'system');return;}
    if(squad.ap<1){chatUI.addLog('SYSTEM',null,'AP 부족 — 사격 불가','system');return;}
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if(this.comms.rollMishear(quality)){const res=this.comms.applyMishear({type:'attack',squadId:squad.id,targetId:target.id},this.squads,squad);if(res.distorted&&res.mishearType==='ignore'){chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);chatUI.addLog(`A${squad.id}`,null,'⚡ 사격 명령 미수신 — 대기','system');this._clearSelection();return;}if(res.distorted)chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);}
    this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});
    squad.ap-=1;
    this.commandedSquadId=squad.id;
    if(this.survival) this.survival.consumeAttack(squad);
    this._clearBlinkHighlights(); this.gridMap.clearHighlights(); this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);
    chatUI.addLog(`A${squad.id}`,null,`E${target.id-CONFIG.SQUAD_COUNT}분대 사격 명령`);
    this._clearSelection();
    this._showProceedBtn('사격 확정');
  }

  _cancelCmd(squad){
    const idx=this.pendingCmds.findIndex(c=>c.squadId===squad.id); if(idx<0) return;
    const old=this.pendingCmds[idx];
    if(old.type==='attack') squad.ap+=1;
    else if(old.type==='mortar'){squad.ap+=1;squad.mortarCooldown=0;}
    this.pendingCmds.splice(idx,1);
    if(this.commandedSquadId===squad.id&&!this.pendingCmds.find(c=>c.squadId===squad.id)){this.commandedSquadId=null;}
  }

  moveSquadTo(squad,targetPos,onDone){
    const gm=this.gridMap;
    const fromWP=gm.toWorld(squad.pos.col,squad.pos.row);
    const toWP=gm.toWorld(targetPos.col,targetPos.row);
    const bh=squad._boxH||gm.TILE_W*0.52;
    const from={x:squad.mesh.position.x,y:fromWP.y+bh/2,z:squad.mesh.position.z};
    const to={x:toWP.x,y:toWP.y+bh/2,z:toWP.z};
    this._animations.push({
      type:'move',squad,from,to,duration:0.30,elapsed:0,
      onComplete:()=>{
        squad.pos={...targetPos};
        squad.terrain=gm.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x,to.y,to.z);
        this._updateOverlapVisuals();
        if(onDone) onDone();
      },
    });
  }

  applyHit(attacker,target){
    const terrain=this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const wDef=attacker.weaponDef||null;
    const hit=this.combat.rollHit(attacker.pos,target.pos,terrain,wDef);
    const aLbl=attacker.side==='ally'?`A${attacker.id}`:`E${attacker.id-CONFIG.SQUAD_COUNT}`;
    const tLbl=target.side==='ally'?`A${target.id}분대`:`E${target.id-CONFIG.SQUAD_COUNT}분대`;
    const wLabel=wDef&&wDef.id!=='rifle'?`[${wDef.labelShort}] `:'';
    if(hit){
      target.troops=Math.max(0,target.troops-1);
      chatUI.addLog(aLbl,null,`${wLabel}${tLbl} 명중! (잔여:${target.troops}명)`);
      if(target.mat){let n=0;const flash=()=>{if(!target.mat)return;target.mat.opacity=n++%2===0?0.15:0.90;if(n<6)setTimeout(flash,90);else target.mat.opacity=0.90;};flash();}
      if(target.troops<=0){target.alive=false;setTimeout(()=>{if(target.mesh)target.mesh.visible=false;this._updateOverlapVisuals();},590);chatUI.addLog('SYSTEM',null,`${tLbl} 전멸`,'system');}
    } else {
      chatUI.addLog(aLbl,null,`${wLabel}사격 — 빗나감`);
      if(wDef&&wDef.suppression&&this.weapon){this.weapon.applySuppression(target);chatUI.addLog('SYSTEM',null,`${tLbl} 제압됨 (다음 턴 AP-1)`,'system');}
    }
  }

  applyMortarFire(attacker,targetPos){
    const wDef=attacker.weaponDef;
    const actual=this.weapon.applyMortarInaccuracy(targetPos,CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    const coord=`${String.fromCharCode(65+(actual.col%26))}-${String(actual.row+1).padStart(2,'0')}`;
    const aLbl=attacker.side==='ally'?`A${attacker.id}`:`E${attacker.id-CONFIG.SQUAD_COUNT}`;
    chatUI.addLog(aLbl,null,`박격포 착탄 → ${coord} (AOE ${CONFIG.MORTAR_AOE}타일)`);
    const depot=this.supply.getDepotAt(actual.col,actual.row);
    if(depot&&depot.alive){
      const res=this.supply.damageDepot(depot.id,1);
      chatUI.addLog('SYSTEM',null,res.destroyed?`배급소#${depot.id} 파괴!`:`배급소#${depot.id} 피격 (HP:${depot.hp}/${depot.maxHp})`,'system');
      this.supply.updateDepotVisual(depot);
    }
    const aoeResults=this.combat.applyAOE(actual,CONFIG.MORTAR_AOE,this.squads,wDef);
    for(const r of aoeResults){
      const tLbl=r.squad.side==='ally'?`A${r.squad.id}분대`:`E${r.squad.id-CONFIG.SQUAD_COUNT}분대`;
      if(r.hit){
        chatUI.addLog(aLbl,null,`폭발 — ${tLbl} 명중! (잔여:${r.squad.troops}명)`);
        if(r.squad.mat){let n=0;const flash=()=>{if(!r.squad.mat)return;r.squad.mat.opacity=n++%2===0?0.15:0.90;if(n<6)setTimeout(flash,90);else r.squad.mat.opacity=0.90;};flash();}
        if(!r.squad.alive){setTimeout(()=>{if(r.squad.mesh)r.squad.mesh.visible=false;this._updateOverlapVisuals();},590);chatUI.addLog('SYSTEM',null,`${tLbl} 전멸`,'system');}
      }
    }
  }

  _syncPanel(){
    const allies=this.squads.filter(s=>s.side==='ally');
    document.querySelectorAll('.squad-card').forEach(card=>{
      const sid=parseInt(card.dataset.squadId);
      const squad=allies.find(s=>s.id===sid); if(!squad) return;
      const troopEl=card.querySelector('.troop-val');
      const moveApEl=card.querySelector('.moveap-val');
      const apEl=card.querySelector('.ap-val');
      if(troopEl) troopEl.textContent=`${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}`;
      if(moveApEl) moveApEl.textContent=`${this._getMoveRange(squad)}칸`;
      if(apEl) apEl.textContent=`${squad.ap}/${CONFIG.SQUAD_AP_MAX}`;
      const q=this._quality(squad);
      const fill=card.querySelector('.stat-fill'),cVal=card.querySelector('.comms-val');
      if(fill){fill.style.width=q+'%';fill.className='stat-fill'+(q<50?' crit':q<CONFIG.COMMS_QUALITY_THRESHOLD?' warn':'');}
      if(cVal) cVal.textContent=q+'%';
      if(squad.supply){
        const wPct=Math.round(squad.supply.water);
        const rPct=Math.round(squad.supply.ration);
        const mPct=Math.round(squad.supply.morale??100);
        const wFill=card.querySelector('.supply-water-fill');
        const rFill=card.querySelector('.supply-ration-fill');
        const mFill=card.querySelector('.supply-morale-fill');
        const wVal=card.querySelector('.supply-water-val');
        const rVal=card.querySelector('.supply-ration-val');
        const mVal=card.querySelector('.supply-morale-val');
        const invRat=card.querySelector('.inv-ration');
        const invWat=card.querySelector('.inv-water');
        if(wFill){wFill.style.width=wPct+'%';wFill.className='supply-water-fill stat-fill'+(wPct<30?' crit':wPct<50?' warn':'');}
        if(rFill){rFill.style.width=rPct+'%';rFill.className='supply-ration-fill stat-fill'+(rPct<20?' crit':rPct<40?' warn':'');}
        if(mFill){mFill.style.width=mPct+'%';mFill.className='supply-morale-fill stat-fill'+(mPct<CONFIG.SURVIVAL_MORALE_SLEEP_BELOW?' crit':mPct<40?' warn':'');}
        if(wVal) wVal.textContent=wPct+'%';
        if(rVal) rVal.textContent=rPct+'%';
        if(mVal) mVal.textContent=mPct+'%';
        if(invRat) invRat.textContent=squad.supply.inv_ration??'?';
        if(invWat) invWat.textContent=squad.supply.inv_water??'?';
      }
      const tag=card.querySelector('.squad-status-tag');
      const hasCmd=!!this.pendingCmds.find(c=>c.squadId===squad.id);
      const stack=squad.alive?this._getSquadsOnTile(squad.pos.col,squad.pos.row,'ally').length:0;
      if(tag){
        if(!squad.alive){tag.textContent='전멸';tag.className='squad-status-tag combat';}
        else if(squad.sleeping){tag.textContent='수면중';tag.className='squad-status-tag nocomms';}
        else if(q<40){tag.textContent='통신두절';tag.className='squad-status-tag nocomms';}
        else if(this.selectedSquad?.id===squad.id){tag.textContent='선택됨';tag.className='squad-status-tag moving';}
        else if(hasCmd){tag.textContent='명령↑';tag.className='squad-status-tag moving';}
        else if(stack>1){tag.textContent=`겹침(${stack})`;tag.className='squad-status-tag nocomms';}
        else{tag.textContent='대기';tag.className='squad-status-tag';}
      }
      const cd=squad._colDef||this._squadColor(squad);
      card.style.borderLeft=`3px solid ${cd.css}`;
      card.classList.toggle('active',this.selectedSquad?.id===squad.id);
    });
    const allyInValley=this.squads.some(s=>s.side==='ally'&&s.alive&&(s.terrain?.id==='valley'||s.terrain?.id==='river'));
    const tw=document.getElementById('terrain-warn'); if(tw) tw.style.display=allyInValley?'flex':'none';
    const batEl=document.getElementById('battery-val');
    if(batEl&&this.comms){const b=this.comms.batteryLevel;batEl.textContent=b+'%';batEl.className='val'+(b<30?' crit':b<50?' warn':'');}
    const phEl=document.getElementById('phase-val');
    if(phEl) phEl.textContent=this.phase==='INPUT'?'명령 입력':this.phase==='EXECUTE'?'실행 중':'종료';
    // v0.9: 주야 HUD (엘리먼트 없어도 안전)
    const dnChip=document.getElementById('daynight-val');
    if(dnChip&&this.dayNight){
      const p=this.dayNight.phase;
      dnChip.textContent=p.label;
      const colorMap={day:'var(--col-green)',dusk:'var(--col-amber)',night:'#4466cc',dawn:'#cc88ff'};
      dnChip.style.color=colorMap[p.id]||'var(--col-green)';
    }
    this._syncDepotChip();
    this._syncCaptureHUD();
  }

  _showDepotPanel(depot,clientX,clientY){
    let panel=document.getElementById('depot-panel');
    if(!panel){panel=document.createElement('div');panel.id='depot-panel';this.container.appendChild(panel);}
    const canRequest=this.commandedSquadId===null;
    const typeLabel=depot.type==='food'?'전투식량 창고':depot.type==='water'?'급수소':'배급소';
    const hasVehicle=this.supplyVehicles?.vehicles.some(v=>v.depotId===depot.id);
    const hp=depot.alive?`HP${depot.hp}/${depot.maxHp}`:'파괴됨';
    let btnHtml='';
    if(!depot.alive)      btnHtml=`<div class="depot-panel-warn">배급소 파괴됨</div>`;
    else if(hasVehicle)   btnHtml=`<div class="depot-panel-warn">보급 차량 운행 중</div>`;
    else if(!canRequest)  btnHtml=`<div class="depot-panel-warn">이번 턴 지휘 완료</div>`;
    else                  btnHtml=`<button class="depot-req-btn" id="_dreq_${depot.id}">보급 요청 (지휘 1회 소모)</button>`;
    panel.innerHTML=`<div class="depot-panel-title">▸ ${typeLabel} #${depot.id}</div><div class="depot-panel-info">${hp}</div>${btnHtml}<button class="depot-close-btn" id="_dclose">✕ 닫기</button>`;
    const rect=this.container.getBoundingClientRect();
    panel.style.cssText=`display:block;left:${Math.min(clientX-rect.left+12,rect.width-210)}px;top:${Math.min(clientY-rect.top+12,rect.height-130)}px;`;
    document.getElementById(`_dreq_${depot.id}`)?.addEventListener('click',()=>{this._requestSupply(depot);panel.style.display='none';});
    document.getElementById('_dclose')?.addEventListener('click',()=>{panel.style.display='none';});
  }

  _requestSupply(depot){
    if(this.commandedSquadId!==null){chatUI.addLog('SYSTEM',null,'이번 턴 지휘 완료 — 보급 요청 불가','system');return;}
    if(!depot.alive){chatUI.addLog('SYSTEM',null,'배급소가 파괴됐습니다','system');return;}
    const type=depot.type||'mixed';
    this.supplyVehicles.request(depot,type);
    this.commandedSquadId='supply_request';
    const label=type==='food'?'전투식량':type==='water'?'급수':'보급';
    chatUI.addLog('SYSTEM',null,`배급소#${depot.id} ${label} 차량 요청 — 다음 턴 출발`,'system');
    this._showProceedBtn('보급 요청 확정');
  }

  _syncCaptureHUD(){
    const chip=document.getElementById('capture-chip');
    const bar=document.getElementById('capture-bar-fill');
    const valEl=document.getElementById('capture-pct-val');
    if(!chip||!this.objective) return;
    if(!this.objective.discovered){chip.style.display='none';return;}
    chip.style.display='flex';
    const pct=this.objective.getGaugePct();
    if(bar){bar.style.width=pct+'%';bar.style.background=pct>=75?'#39ff8e':pct>=40?'#ffb84d':'#ff4444';}
    if(valEl){valEl.textContent=pct+'%';valEl.style.color=pct>=75?'#39ff8e':pct>=40?'#ffcc44':'#ff4444';}
  }

  _syncDepotChip(){
    if(!this.supply) return;
    const chip=document.getElementById('supply-chip');
    const lines=document.getElementById('depot-status-lines');
    if(!chip||!lines) return;
    const allyDepots=this.supply.depots.filter(d=>d.side==='ally');
    if(allyDepots.length===0){chip.style.display='none';return;}
    chip.style.display='block';
    lines.innerHTML=allyDepots.map(d=>{
      const col=String.fromCharCode(65+(d.col%26));
      const row=String(d.row+1).padStart(2,'0');
      // ★ [BUG5 FIX] maxWater/maxRation=0 나누기 0 방어
      const wPct=d.maxWater>0?Math.round(d.water/d.maxWater*100):0;
      const rPct=d.maxRation>0?Math.round(d.ration/d.maxRation*100):0;
      const cls=!d.alive?'depot-line dead':wPct<30||rPct<30?'depot-line warn':'depot-line';
      const hp=d.alive?`HP${d.hp}/${d.maxHp}`:'파괴';
      return `<div class="${cls}">#${d.id}(${col}-${row}) 물:${wPct}% 식:${rPct}% ${hp}</div>`;
    }).join('');
  }

  _quality(squad){return this.comms?Math.round(this.comms.calcQuality({terrain:squad.terrain})):100;}

  _setupInput(){
    const cv=this.renderer.domElement; cv.style.pointerEvents='auto';
    cv.addEventListener('pointerdown',e=>{this._mouseDownPos={x:e.clientX,y:e.clientY};});
    cv.addEventListener('pointerup',e=>{
      if(!this._mouseDownPos) return;
      const dx=Math.abs(e.clientX-this._mouseDownPos.x),dy=Math.abs(e.clientY-this._mouseDownPos.y);
      this._mouseDownPos=null;
      if(dx<6&&dy<6) this._onCanvasClick(e);
    });
    cv.addEventListener('pointermove',e=>{
      const hit=this._raycastTile(e);
      if(hit){const el=document.getElementById('hud-coord');if(el)el.textContent=`${String.fromCharCode(65+(hit.col%26))}-${String(hit.row+1).padStart(2,'0')}`;}
    });
  }

  _onCanvasClick(e){
    if(this.phase!=='INPUT') return; this._hideSquadPicker();
    const mouse=this._toNDC(e); this.raycaster.setFromCamera(mouse,this.camera);
    const hits=this.raycaster.intersectObjects(this.squads.filter(s=>s.alive&&s.boxMesh).map(s=>s.boxMesh),false);
    if(hits.length>0){
      const {squadId}=hits[0].object.userData;
      const clicked=this.squads.find(s=>s.id===squadId&&s.alive);
      if(clicked){
        if(clicked.side==='ally'){const coloc=this._getSquadsOnTile(clicked.pos.col,clicked.pos.row,'ally');if(coloc.length>1){this._showSquadPicker(coloc,e.clientX,e.clientY);return;}else{this.selectSquad(clicked);return;}}
        if(this.selectedSquad){this._issueAttack(this.selectedSquad,clicked);return;}
      }
    }
    let col,row;
    if(this.gridMap._largeMap){
      const gc=this._raycastToGrid(e);if(!gc)return;col=gc.col;row=gc.row;
    } else {
      const tHits=this.raycaster.intersectObjects(this.gridMap.getTileMeshes()).sort((a,b)=>a.distance-b.distance);
      if(!tHits.length)return;
      col=tHits[0].object.userData.col;
      row=tHits[0].object.userData.row;
    }
    if(col===undefined||row===undefined) return;
    const allies=this._getSquadsOnTile(col,row,'ally');
    if(allies.length>1){this._showSquadPicker(allies,e.clientX,e.clientY);return;}
    if(allies.length===1){this.selectSquad(allies[0]);return;}
    const depot=this.supply?.getDepotAt(col,row);
    if(depot&&depot.side==='ally'){this._showDepotPanel(depot,e.clientX,e.clientY);return;}
    if(!this.selectedSquad) return;
    const enemy=this.squads.find(q=>q.side==='enemy'&&q.alive&&q.pos.col===col&&q.pos.row===row);
    if(enemy){this._issueAttack(this.selectedSquad,enemy);return;}
    this._issueMove(this.selectedSquad,{col,row});
  }

  _raycastToGrid(e){
    this.raycaster.setFromCamera(this._toNDC(e),this.camera);
    const ray=this.raycaster.ray;
    if(Math.abs(ray.direction.y)<0.0001) return null;
    const t=-ray.origin.y/ray.direction.y; if(t<0) return null;
    return this.gridMap.worldToGrid(ray.origin.x+t*ray.direction.x,ray.origin.z+t*ray.direction.z);
  }
  _toNDC(e){const r=this.renderer.domElement.getBoundingClientRect();return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);}
  _raycastTile(e){this.raycaster.setFromCamera(this._toNDC(e),this.camera);if(this.gridMap._largeMap)return this._raycastToGrid(e);const h=this.raycaster.intersectObjects(this.gridMap.getTileMeshes()).sort((a,b)=>a.distance-b.distance);return h.length?h[0].object.userData:null;}
  _onResize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}

  _updateAnimations(delta){
    const done=[];
    for(const a of this._animations){
      a.elapsed+=delta;
      const t=Math.min(a.elapsed/a.duration,1);
      const ease=t<0.5?2*t*t:-1+(4-2*t)*t;
      if(a.type==='move'){
        a.squad.mesh.position.x=a.from.x+(a.to.x-a.from.x)*ease;
        a.squad.mesh.position.z=a.from.z+(a.to.z-a.from.z)*ease;
        const baseY=a.from.y+(a.to.y-a.from.y)*ease;
        const archH=(this.gridMap?.TILE_W||0.3)*0.6;
        a.squad.mesh.position.y=baseY+Math.sin(Math.PI*t)*archH;
      }
      if(t>=1){done.push(a);a.onComplete?.();}
    }
    this._animations=this._animations.filter(a=>!done.includes(a));
  }

  _tick(ts){
    requestAnimationFrame(this._tick.bind(this));
    const now=ts||0,delta=Math.min((now-(this._lastTime||now))/1000,0.1);
    this._lastTime=now;
    this._updateAnimations(delta);
    if(this._moveHighlights.length||this._attackHighlights.length){
      const blink=Math.sin(now*0.006)*0.5+0.5;
      for(const m of this._moveHighlights)   m.material.opacity=0.07+blink*0.30;
      for(const m of this._attackHighlights) m.material.opacity=0.10+blink*0.35;
    }
    if(this.controls) this.controls.update();
    this.renderer.render(this.scene3d,this.camera);
  }
}
