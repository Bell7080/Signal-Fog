/* ============================================================
   GameScene.js v0.7
   ────────────────────────────────────────────────────────────
   핵심 변경:
   1. 유닛 착지 공식 통일
      · gm.toWorld(col,row).y = tile.height (타일 top 면)
      · _createMesh:   group.y = tile.height + boxH/2
      · moveSquadTo:   to.y   = tile.height + boxH/2  (이동 목적지)
      · _updateOverlapVisuals: 동일 공식
   2. _drawObjective / fog ghost 등도 tile.height 직접 참조
   3. _initFog 소형 맵 포그 평면 y = tile.height + 0.04
   4. 카메라 HEIGHT_MAX 기반으로 시작 높이 추가 보정
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

/* ── 맵 생성 (지형 + 하천 연결) ───────────────────────────── */
function _generateMap() {
  const rows=CONFIG.GRID_ROWS, cols=CONFIG.GRID_COLS;
  const map=[];
  for (let r=0;r<rows;r++) {
    map[r]=[];
    for (let c=0;c<cols;c++) {
      if (r<=1||r>=rows-2){map[r][c]='OPEN';continue;}
      const rnd=Math.random();
      if      (rnd<0.22) map[r][c]='FOREST';
      else if (rnd<0.32) map[r][c]='HILL';
      else if (rnd<0.38) map[r][c]='VALLEY';
      else               map[r][c]='OPEN';
    }
  }
  const riverCount=cols>=20?2:1, riverRows=[];
  for (let ri=0;ri<riverCount;ri++) {
    const horiz=Math.random()<0.6;
    if (horiz) {
      let sr=Math.floor(rows*0.3)+Math.floor(Math.random()*rows*0.4);
      sr=Math.max(3,Math.min(rows-4,sr));
      if (riverRows.some(r=>Math.abs(r-sr)<3)) continue;
      riverRows.push(sr);
      let cr=sr;
      for (let c=0;c<cols;c++) {
        if (cr<=1||cr>=rows-2){cr=sr;continue;}
        map[cr][c]='RIVER';
        if (c<cols-1){const d=Math.random();if(d<0.2&&cr>3)cr--;else if(d<0.4&&cr<rows-4)cr++;}
      }
      const bc=new Set();
      while(bc.size<Math.max(1,Math.floor(cols/10)))bc.add(Math.floor(cols*0.2)+Math.floor(Math.random()*cols*0.6));
      for(const b of bc){for(let r=2;r<rows-2;r++){if(map[r][b]==='RIVER'){map[r][b]='BRIDGE';break;}}}
    } else {
      let sc=Math.floor(cols*0.2)+Math.floor(Math.random()*cols*0.6);
      sc=Math.max(2,Math.min(cols-3,sc));
      let cc=sc;
      for(let r=2;r<rows-2;r++){map[r][cc]='RIVER';if(r<rows-3){const d=Math.random();if(d<0.2&&cc>2)cc--;else if(d<0.4&&cc<cols-3)cc++;}}
      const br=new Set();
      while(br.size<Math.max(1,Math.floor(rows/10)))br.add(3+Math.floor(Math.random()*(rows-6)));
      for(const b of br){for(let c=0;c<cols;c++){if(map[b][c]==='RIVER'){map[b][c]='BRIDGE';break;}}}
    }
  }
  return map;
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

/* ── 카메라 파라미터 (맵 크기별 자동 조절) ────────────────── */
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
    this._animations=[]; this._lastTime=null; this._mouseDownPos=null;
    this.fog=null; this._fogMeshes={}; this._ghostMeshes={}; this._overlapBadges={};
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
    const obj=this._DEMO_OBJECTIVE;
    const objLabel=`${String.fromCharCode(65+(obj.col%26))}-${String(obj.row+1).padStart(2,'0')}`;
    chatUI.addLog('OC/T',null,`훈련 개시. 목표: ${objLabel} 점령. 분대 선택 후 이동 타일 클릭.`);
    chatUI.addLog('SYSTEM',null,`맵 ${CONFIG.GRID_COLS}×${CONFIG.GRID_ROWS} | 아군 ${CONFIG.SQUAD_COUNT}분대 | 적군 ${CONFIG.ENEMY_COUNT}분대`,'system');
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

    this.camera=new THREE.PerspectiveCamera(fov,w/h,0.1,camDist*6);
    this.camera.position.set(0,camHeight,camDist);
    this.camera.lookAt(0,0,0);

    this.controls=null;
    try {
      if (typeof THREE.OrbitControls!=='undefined') {
        this.controls=new THREE.OrbitControls(this.camera,this.renderer.domElement);
        Object.assign(this.controls,{
          target:new THREE.Vector3(0,0,0), enableDamping:true, dampingFactor:0.08,
          minDistance:tileW*2, maxDistance:camDist*3, maxPolarAngle:Math.PI/2.05, screenSpacePanning:true,
        });
      }
    } catch(e){console.warn('[GameScene] OrbitControls 없음:',e.message);}

    const worldSize=mapSize*tileW;
    this.scene3d.add(new THREE.AmbientLight(0x0a2010,1.5));
    const pl=new THREE.PointLight(0x39ff8e,1.5,worldSize*4);
    pl.position.set(0,camHeight*1.5,0); this.scene3d.add(pl);
    const pl2=new THREE.PointLight(0x2277cc,0.5,worldSize*3);
    pl2.position.set(-worldSize*0.3,camHeight,worldSize*0.3); this.scene3d.add(pl2);

    this.raycaster=new THREE.Raycaster();
  }

  _initSystems() {
    this.gridMap    =new GridMap(this);
    this.comms      =new CommsSystem();
    this.combat     =new CombatSystem();
    this.enemyAI    =new EnemyAI(new GeminiClient(),new FallbackAI());
    this.turnManager=new TurnManager(this);
    const layout=_generateMap();
    this.gridMap.build(layout);
    this._drawObjective();
    this._initSquads();
    this._initFog();
    this._updateFog();
  }

  /* ── 포그 초기화 ─────────────────────────────────────────── */
  _initFog() {
    this.fog=new FogOfWar(this.gridMap);
    const gm=this.gridMap;
    if (gm._largeMap) {
      this._fogMode='canvas'; this._initFogCanvas();
    } else {
      this._fogMode='mesh';
      for(let r=0;r<CONFIG.GRID_ROWS;r++) {
        for(let c=0;c<CONFIG.GRID_COLS;c++) {
          const h =gm.tiles[r][c].height;  // ★ tile.height
          const wx=c*gm.TILE_W+gm.OFFSET_X;
          const wz=r*gm.TILE_W+gm.OFFSET_Z;
          const mesh=new THREE.Mesh(
            new THREE.PlaneGeometry(gm.TILE_W,gm.TILE_W),
            new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})
          );
          mesh.rotation.x=-Math.PI/2;
          mesh.position.set(wx,h+0.04,wz);  // ★ tile.height 위에 딱 붙임
          mesh.renderOrder=3;
          this.scene3d.add(mesh);
          this._fogMeshes[`${c},${r}`]=mesh;
        }
      }
    }
    for(const s of this.squads.filter(q=>q.side==='enemy')) {
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
    fogPlane.position.set(gm.OFFSET_X+totalW/2-gm.TILE_W/2, gm.HEIGHT_MAX+0.05, gm.OFFSET_Z+totalH/2-gm.TILE_W/2);
    fogPlane.renderOrder=3;
    this.scene3d.add(fogPlane);
    this._fogPlane=fogPlane;
  }

  _updateFog() {
    if(!this.fog) return;
    this.fog.computeVisible(this.squads.filter(s=>s.side==='ally'&&s.alive));
    const gm=this.gridMap;
    if(this._fogMode==='canvas') {
      const ctx=this._fogCtx, RES=this._fogResRCP;
      ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
      ctx.fillStyle='rgba(0,0,0,0.76)'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      for(let r=0;r<CONFIG.GRID_ROWS;r++)
        for(let c=0;c<CONFIG.GRID_COLS;c++)
          if(this.fog.isVisible(c,r)) ctx.clearRect(c*RES,r*RES,RES,RES);
      this._fogTex.needsUpdate=true;
    } else {
      for(let r=0;r<CONFIG.GRID_ROWS;r++)
        for(let c=0;c<CONFIG.GRID_COLS;c++) {
          const m=this._fogMeshes[`${c},${r}`];
          if(m) m.material.opacity=this.fog.isVisible(c,r)?0:0.76;
        }
    }
    for(const s of this.squads.filter(q=>q.side==='enemy')) {
      const inSight=this.fog.isVisible(s.pos.col,s.pos.row);
      if(s.mesh) s.mesh.visible=s.alive&&inSight;
      const ghost=this._ghostMeshes[s.id]; if(!ghost) continue;
      if(inSight&&s.alive){this.fog.updateLastKnown(s.id,s.pos);ghost.visible=false;}
      else if(s.alive){
        const lk=this.fog.getLastKnown(s.id);
        if(lk){
          const wp=gm.toWorld(lk.col,lk.row);
          // ★ ghost y = tile.height + 유닛 키 만큼 위
          ghost.position.set(wp.x, wp.y+gm.TILE_W*0.7, wp.z);
          ghost.visible=true;
        }
      } else{ghost.visible=false;}
    }
  }

  /* ── 목표 지점 마커 ─────────────────────────────────────── */
  _drawObjective() {
    const obj=this._DEMO_OBJECTIVE, gm=this.gridMap;
    const wp=gm.toWorld(obj.col,obj.row);
    const h =gm.tiles[obj.row][obj.col].height;  // ★ tile.height
    const S =gm.TILE_W*0.45, TW=gm.TILE_W;
    const pts=[
      new THREE.Vector3(wp.x-S,h+0.03,wp.z-S),
      new THREE.Vector3(wp.x+S,h+0.03,wp.z-S),
      new THREE.Vector3(wp.x+S,h+0.03,wp.z+S),
      new THREE.Vector3(wp.x-S,h+0.03,wp.z+S),
      new THREE.Vector3(wp.x-S,h+0.03,wp.z-S),
    ];
    this.scene3d.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xffb84d})));
    const star=_makeTextSprite('★','#ffb84d');
    star.position.set(wp.x,h+TW*1.1,wp.z); star.scale.set(TW*1.6,TW*1.6,1); this.scene3d.add(star);
    const lbl=_makeTextSprite('OBJ','#ffb84d');
    lbl.position.set(wp.x,h+TW*0.5,wp.z); lbl.scale.set(TW,TW*0.6,1); this.scene3d.add(lbl);
  }

  /* ── 분대 초기화 ─────────────────────────────────────────── */
  _initSquads() {
    const cols=CONFIG.GRID_COLS,rows=CONFIG.GRID_ROWS;
    for(const d of _calcSpawn(CONFIG.SQUAD_COUNT,'ally',cols,rows)){const s=this._makeSquad(d.id,'ally',d.col,d.row);this.squads.push(s);this._createMesh(s);}
    for(const d of _calcSpawn(CONFIG.ENEMY_COUNT,'enemy',cols,rows)){const s=this._makeSquad(d.id,'enemy',d.col,d.row);this.squads.push(s);this._createMesh(s);}
    this._buildSquadPanel(); this._syncPanel(); this._updateOverlapVisuals();
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
      card.innerHTML=`<div class="squad-card-header"><span class="squad-badge" style="color:${cd.css};border-color:${cd.css}">A${squad.id}분대</span><span class="squad-status-tag">대기</span></div><div class="squad-troops">병력 <span>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</span> &nbsp;|&nbsp; AP <span>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</span></div><div class="comms-row"><span class="comms-label">통신</span><div class="stat-bar"><div class="stat-fill" style="width:100%"></div></div><span class="comms-val">100%</span></div>`;
      card.addEventListener('click',()=>this.selectSquadById(squad.id));
      list.appendChild(card);
    });
  }

  _makeSquad(id,side,col,row){
    return{id,side,pos:{col,row},troops:CONFIG.SQUAD_TROOP_MAX,ap:CONFIG.SQUAD_AP_MAX,terrain:CONFIG.TERRAIN.OPEN,alive:true,mesh:null,mat:null,boxMesh:null,_boxH:0};
  }
  _squadColor(squad){return squad.side==='enemy'?ENEMY_COLOR_DEF:ALLY_COLOR_DEFS[(squad.id-1)%ALLY_COLOR_DEFS.length];}

  /* ────────────────────────────────────────────────────────
     _createMesh — 유닛 착지 핵심
     group.position.y = tile.height + boxH/2
     → 박스 bottom 면이 정확히 tile.height (타일 top 면) 에 닿음
  ──────────────────────────────────────────────────────── */
  _createMesh(squad) {
    const gm   =this.gridMap;
    const wp   =gm.toWorld(squad.pos.col,squad.pos.row);  // wp.y = tile.height
    const cd   =this._squadColor(squad);
    const TW   =gm.TILE_W;
    const label=squad.side==='ally'?`A${squad.id}`:`E${squad.id-CONFIG.SQUAD_COUNT}`;

    const group=new THREE.Group();

    const bw=TW*0.78, bh=TW*0.52, bd=TW*0.78;
    const geo=new THREE.BoxGeometry(bw,bh,bd);
    const mat=new THREE.MeshLambertMaterial({color:cd.hex,transparent:true,opacity:0.90});
    const box=new THREE.Mesh(geo,mat);
    box.userData={squadId:squad.id};
    group.add(box);

    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({color:cd.hex,transparent:true,opacity:0.9})
    ));

    const mapSize=Math.max(CONFIG.GRID_COLS,CONFIG.GRID_ROWS);
    const labelScale=mapSize>60?0.7:1.0;
    const sprite=_makeSquadLabelSprite(label,cd.css,cd.bg);
    sprite.position.set(0,TW*0.95,0);
    sprite.scale.set(TW*1.6*labelScale,TW*0.75*labelScale,1);
    sprite.raycast=()=>{};
    group.add(sprite);

    // ★ 핵심: tile.height + boxH/2 → 박스 바닥이 타일 top 면에 정확히 착지
    group.position.set(wp.x, wp.y + bh/2, wp.z);
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

  /* ── 겹침 시각 처리 — y 좌표 동일 공식 적용 ─────────────── */
  _updateOverlapVisuals() {
    if(!this.scene3d||!this.gridMap) return;
    for(const b of Object.values(this._overlapBadges)){this.scene3d.remove(b);b.material?.map?.dispose();b.material?.dispose();}
    this._overlapBadges={};
    const gm=this.gridMap, TW=gm.TILE_W;

    const _placeSquads=(list,showBadge)=>{
      const [col,row]=list[0].pos.col!==undefined?[list[0].pos.col,list[0].pos.row]:[0,0];
      const base=gm.toWorld(list[0].pos.col,list[0].pos.row);  // base.y = tile.height
      if(list.length===1){
        const s=list[0];
        s.mesh.position.set(base.x, base.y+s._boxH/2, base.z);
      } else {
        const off=this._calcOffsets(list.length);
        list.forEach((s,i)=>s.mesh.position.set(base.x+off[i].dx, base.y+s._boxH/2, base.z+off[i].dz));
        if(showBadge){
          const badge=_makeTextSprite(`×${list.length}`,'#ffb84d');
          badge.position.set(base.x, base.y+TW*1.7, base.z);
          badge.scale.set(TW,TW*0.6,1); badge.renderOrder=10;
          this.scene3d.add(badge);
          this._overlapBadges[`${list[0].pos.col},${list[0].pos.row}`]=badge;
        }
      }
    };

    // 아군
    const allyG={};
    for(const s of this.squads.filter(q=>q.alive&&q.mesh&&q.side==='ally')){const k=`${s.pos.col},${s.pos.row}`;(allyG[k]=allyG[k]||[]).push(s);}
    for(const list of Object.values(allyG)) _placeSquads(list,true);

    // 적군 (배지 없음)
    const enemyG={};
    for(const s of this.squads.filter(q=>q.alive&&q.mesh&&q.side==='enemy')){const k=`${s.pos.col},${s.pos.row}`;(enemyG[k]=enemyG[k]||[]).push(s);}
    for(const list of Object.values(enemyG)) _placeSquads(list,false);
  }

  /* ── Squad Picker ────────────────────────────────────────── */
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
      card.innerHTML=`<div class="picker-card-stripe" style="background:${cd.css}"></div><div class="picker-card-content"><div class="picker-card-header"><span class="picker-card-name" style="color:${cd.css}">A${squad.id}분대</span>${hasCmd?`<span class="picker-cmd-tag">명령↑</span>`:''}</div><div class="picker-card-row"><span class="picker-stat-item">병력 <b>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</b></span><span class="picker-stat-item">AP <b>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</b></span><span class="picker-stat-item" style="color:${qColor}">통신 <b>${q}%</b></span></div></div><div class="picker-card-arrow">▶</div>`;
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
    picker.style.top =Math.min(clientY-rect.top+14, rect.height-PH-6)+'px';
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
    this.gridMap.clearHighlights(); this._showMoveTargets(squad); this._syncPanel();
    const pos=`${String.fromCharCode(65+(squad.pos.col%26))}-${String(squad.pos.row+1).padStart(2,'0')}`;
    chatUI.addLog('SYSTEM',null,`A${squad.id}분대 선택 — 위치:${pos} | AP:${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신:${this._quality(squad)}%`,'system');
  }
  selectSquadById(id){const s=this.squads.find(q=>q.side==='ally'&&q.id===id);if(s)this.selectSquad(s);}

  _showMoveTargets(squad){
    for(let r=0;r<CONFIG.GRID_ROWS;r++)
      for(let c=0;c<CONFIG.GRID_COLS;c++){
        const dist=Math.abs(c-squad.pos.col)+Math.abs(r-squad.pos.row);
        if(dist===0||dist>squad.ap) continue;
        const cost=this.gridMap.tiles[r][c].terrain.moveCost||1;
        if(cost>squad.ap) continue;
        const stack=this._getSquadsOnTile(c,r,'ally').length;
        this.gridMap.highlightTile(c,r,stack>0?0xffb84d:0x39ff8e,stack>0?0.30:0.18);
      }
    for(const e of this.squads.filter(q=>q.side==='enemy'&&q.alive))
      if(this.combat.inRange(squad.pos,e.pos)) this.gridMap.highlightTile(e.pos.col,e.pos.row,0xff4444,0.38);
  }

  _clearSelection(){
    if(this.selectedSquad?.mat){this.selectedSquad.mat.emissive=new THREE.Color(0);this.selectedSquad.mat.opacity=0.90;this.selectedSquad.mesh.scale.set(1,1,1);}
    this.selectedSquad=null; this.gridMap.clearHighlights(); this._syncPanel();
  }

  _issueMove(squad,targetPos){
    const dist=Math.abs(targetPos.col-squad.pos.col)+Math.abs(targetPos.row-squad.pos.row);
    if(dist===0) return;
    const cost=this.gridMap.tiles[targetPos.row][targetPos.col].terrain.moveCost||1;
    if(cost>squad.ap){chatUI.addLog('SYSTEM',null,`AP 부족(필요:${cost},보유:${squad.ap})`,'system');return;}
    if(dist>squad.ap){chatUI.addLog('SYSTEM',null,`이동 거리 초과(거리:${dist},AP:${squad.ap})`,'system');return;}
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if(this.comms.rollMishear(quality)){
      const res=this.comms.applyMishear({type:'move',squadId:squad.id,targetTile:targetPos,targetPos},this.squads,squad);
      if(res.distorted){
        chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
        if(res.mishearType==='ignore'){chatUI.addLog(`A${squad.id}`,null,'⚡ 명령 미수신 — 대기','system');this._clearSelection();return;}
        if(res.mishearType==='attack_instead'){const target=this.squads.find(s=>s.id===res.command.targetId&&s.alive);if(target&&squad.ap>=1){this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});squad.ap-=1;chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 → E${target.id-CONFIG.SQUAD_COUNT}분대 사격으로 둔갑`);this.gridMap.clearHighlights();this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);}else{chatUI.addLog(`A${squad.id}`,null,'⚡ 오청(사격 둔갑) — AP 부족으로 대기','system');}this._clearSelection();return;}
        if(res.mishearType==='coord'){const dp=res.command.targetTile,dc=this.gridMap.tiles[dp.row][dp.col].terrain.moveCost||1,dd=Math.abs(dp.col-squad.pos.col)+Math.abs(dp.row-squad.pos.row);if(dd>0&&dc<=squad.ap&&dd<=squad.ap){this.pendingCmds.push({type:'move',squadId:squad.id,targetPos:dp});squad.ap-=dc;this.gridMap.clearHighlights();this.gridMap.highlightTile(dp.col,dp.row,0xffb84d,0.50);chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 이동 → ${String.fromCharCode(65+(dp.col%26))}-${String(dp.row+1).padStart(2,'0')}`);}else{chatUI.addLog(`A${squad.id}`,null,'⚡ 오청 좌표 이동 불가 → 대기','system');}this._clearSelection();return;}
      }
    }
    this.pendingCmds.push({type:'move',squadId:squad.id,targetPos});
    squad.ap-=cost;
    this.gridMap.clearHighlights(); this.gridMap.highlightTile(targetPos.col,targetPos.row,0x39ff8e,0.50);
    chatUI.addLog(`A${squad.id}`,null,`이동 → ${String.fromCharCode(65+(targetPos.col%26))}-${String(targetPos.row+1).padStart(2,'0')}`);
    this._clearSelection();
  }

  _issueAttack(squad,target){
    if(!this.combat.inRange(squad.pos,target.pos)){chatUI.addLog('SYSTEM',null,`사거리 밖(최대${CONFIG.RIFLE_RANGE}타일)`,'system');return;}
    if(squad.ap<1){chatUI.addLog('SYSTEM',null,'AP 부족 — 사격 불가','system');return;}
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if(this.comms.rollMishear(quality)){const res=this.comms.applyMishear({type:'attack',squadId:squad.id,targetId:target.id},this.squads,squad);if(res.distorted&&res.mishearType==='ignore'){chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);chatUI.addLog(`A${squad.id}`,null,'⚡ 사격 명령 미수신 — 대기','system');this._clearSelection();return;}if(res.distorted)chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);}
    this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});
    squad.ap-=1;
    this.gridMap.clearHighlights(); this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);
    chatUI.addLog(`A${squad.id}`,null,`E${target.id-CONFIG.SQUAD_COUNT}분대 사격 명령`);
    this._clearSelection();
  }

  _cancelCmd(squad){
    const idx=this.pendingCmds.findIndex(c=>c.squadId===squad.id); if(idx<0) return;
    const old=this.pendingCmds[idx];
    if(old.type==='move') squad.ap+=(this.gridMap.tiles[old.targetPos.row][old.targetPos.col].terrain.moveCost||1);
    else if(old.type==='attack') squad.ap+=1;
    this.pendingCmds.splice(idx,1);
  }

  /* ────────────────────────────────────────────────────────
     moveSquadTo — 이동 애니메이션
     from.y / to.y = tile.height + boxH/2 로 통일
     → 이동 중에도 유닛이 항상 각 타일 높이 위에서 착지
  ──────────────────────────────────────────────────────── */
  moveSquadTo(squad,targetPos,onDone){
    const gm    =this.gridMap;
    const fromWP=gm.toWorld(squad.pos.col,squad.pos.row);
    const toWP  =gm.toWorld(targetPos.col,targetPos.row);
    const bh    =squad._boxH||gm.TILE_W*0.52;

    const from={x:squad.mesh.position.x, y:fromWP.y+bh/2, z:squad.mesh.position.z};
    const to  ={x:toWP.x,                y:toWP.y  +bh/2, z:toWP.z};

    this._animations.push({
      type:'move',squad,from,to,duration:0.30,elapsed:0,
      onComplete:()=>{
        squad.pos    ={...targetPos};
        squad.terrain=gm.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x,to.y,to.z);
        this._updateOverlapVisuals();
        if(onDone) onDone();
      },
    });
  }

  applyHit(attacker,target){
    const terrain=this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit=this.combat.rollHit(attacker.pos,target.pos,terrain);
    const aLbl=attacker.side==='ally'?`A${attacker.id}`:`E${attacker.id-CONFIG.SQUAD_COUNT}`;
    const tLbl=target.side==='ally'?`A${target.id}분대`:`E${target.id-CONFIG.SQUAD_COUNT}분대`;
    if(hit){
      target.troops=Math.max(0,target.troops-1);
      chatUI.addLog(aLbl,null,`${tLbl} 명중! (잔여:${target.troops}명)`);
      if(target.mat){let n=0;const flash=()=>{if(!target.mat)return;target.mat.opacity=n++%2===0?0.15:0.90;if(n<6)setTimeout(flash,90);else target.mat.opacity=0.90;};flash();}
      if(target.troops<=0){target.alive=false;setTimeout(()=>{if(target.mesh)target.mesh.visible=false;this._updateOverlapVisuals();},590);chatUI.addLog('SYSTEM',null,`${tLbl} 전멸`,'system');}
    } else{chatUI.addLog(aLbl,null,'사격 — 빗나감');}
  }

  _syncPanel(){
    const allies=this.squads.filter(s=>s.side==='ally');
    document.querySelectorAll('.squad-card').forEach(card=>{
      const sid=parseInt(card.dataset.squadId);
      const squad=allies.find(s=>s.id===sid); if(!squad) return;
      const spans=card.querySelectorAll('.squad-troops span');
      if(spans[0])spans[0].textContent=`${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}`;
      if(spans[1])spans[1].textContent=`${squad.ap}/${CONFIG.SQUAD_AP_MAX}`;
      const q=this._quality(squad);
      const fill=card.querySelector('.stat-fill'),cVal=card.querySelector('.comms-val');
      if(fill){fill.style.width=q+'%';fill.className='stat-fill'+(q<50?' crit':q<CONFIG.COMMS_QUALITY_THRESHOLD?' warn':'');}
      if(cVal)cVal.textContent=q+'%';
      const tag=card.querySelector('.squad-status-tag');
      const hasCmd=!!this.pendingCmds.find(c=>c.squadId===squad.id);
      const stack=squad.alive?this._getSquadsOnTile(squad.pos.col,squad.pos.row,'ally').length:0;
      if(tag){
        if(!squad.alive){tag.textContent='전멸';tag.className='squad-status-tag combat';}
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
    const tw=document.getElementById('terrain-row'); if(tw)tw.style.display=allyInValley?'':'none';
    const batEl=document.querySelector('.commander-block .resource-val');
    if(batEl){const b=this.comms.batteryLevel;batEl.textContent=b+'%';batEl.className='resource-val'+(b<30?' crit':b<50?' warn':'');}
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
    if(this.gridMap._largeMap){const gc=this._raycastToGrid(e);if(!gc)return;col=gc.col;row=gc.row;}
    else{const tHits=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());if(!tHits.length)return;col=tHits[0].object.userData.col;row=tHits[0].object.userData.row;}
    if(col===undefined||row===undefined) return;
    const allies=this._getSquadsOnTile(col,row,'ally');
    if(allies.length>1){this._showSquadPicker(allies,e.clientX,e.clientY);return;}
    if(allies.length===1){this.selectSquad(allies[0]);return;}
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
    return this.gridMap.worldToGrid(ray.origin.x+t*ray.direction.x, ray.origin.z+t*ray.direction.z);
  }
  _toNDC(e){const r=this.renderer.domElement.getBoundingClientRect();return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);}
  _raycastTile(e){this.raycaster.setFromCamera(this._toNDC(e),this.camera);if(this.gridMap._largeMap)return this._raycastToGrid(e);const h=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());return h.length?h[0].object.userData:null;}
  _onResize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}

  /* ── 이동 애니메이션 처리 ────────────────────────────────── */
  _updateAnimations(delta){
    const done=[];
    for(const a of this._animations){
      a.elapsed+=delta;
      const t=Math.min(a.elapsed/a.duration,1);
      const ease=t<0.5?2*t*t:-1+(4-2*t)*t;  // easeInOut
      if(a.type==='move'){
        a.squad.mesh.position.x=a.from.x+(a.to.x-a.from.x)*ease;
        a.squad.mesh.position.z=a.from.z+(a.to.z-a.from.z)*ease;
        // y: 출발~도착 높이 선형 보간 + sin 아치 (이동 연출)
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
    if(this.controls) this.controls.update();
    this.renderer.render(this.scene3d,this.camera);
  }
}
