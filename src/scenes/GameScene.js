/* ============================================================
   GameScene.js — Three.js 3D 메인 게임 씬
   v0.2: 250×250 맵 확장 + 동적 분대 수 지원
         - 분대 스폰: 아군/적군 수에 따라 균등 배치
         - 카메라: 넓은 맵에 맞게 높이·거리 조정
         - 좌표 레이블: 성능상 10칸 간격으로 출력
         - 목표 지점: 맵 중앙으로 이동
   ============================================================ */

/* ── 분대별 고유 색상 (10색 팔레트) ── */
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

/* ── 유닛 라벨 스프라이트 ── */
function _makeSquadLabelSprite(text, textCss, bgCss) {
  const W=160, H=72, cv=document.createElement('canvas');
  cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d'), r=14;
  ctx.fillStyle=bgCss;
  ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-r,0);
  ctx.arcTo(W,0,W,r,r); ctx.lineTo(W,H-r);
  ctx.arcTo(W,H,W-r,H,r); ctx.lineTo(r,H);
  ctx.arcTo(0,H,0,H-r,r); ctx.lineTo(0,r);
  ctx.arcTo(0,0,r,0,r); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=textCss; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle=textCss; ctx.font='bold 40px "Share Tech Mono", monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text, W/2, H/2);
  const tex=new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
}

function _makeTextSprite(text, color='#39ff8e') {
  const cv=document.createElement('canvas'); cv.width=128; cv.height=64;
  const ctx=cv.getContext('2d');
  ctx.fillStyle=color; ctx.font='bold 38px "Share Tech Mono", monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(text,64,32);
  const tex=new THREE.CanvasTexture(cv);
  return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
}

/* ── 맵 생성 (250×250) ── */
function _generateMap() {
  const rows=CONFIG.GRID_ROWS, cols=CONFIG.GRID_COLS, map=[];
  // 노이즈 기반 지형 생성 (시드값 기반 의사랜덤)
  for (let r=0; r<rows; r++) {
    const row=[];
    for (let c=0; c<cols; c++) {
      let t;
      if (r<=2 || r>=rows-3) { t='OPEN'; }               // 스폰존 개활지
      else {
        // 계곡 띠: 맵 1/3, 2/3 지점에 대각 방향으로 배치
        const mid1=Math.floor(rows*0.33), mid2=Math.floor(rows*0.66);
        const inV1 = Math.abs(r-mid1) <= 2;
        const inV2 = Math.abs(r-mid2) <= 2;
        if (inV1 || inV2) {
          t = 'VALLEY';
        } else {
          const rnd=Math.random();
          if      (rnd < 0.20) t='FOREST';
          else if (rnd < 0.32) t='HILL';
          else                 t='OPEN';
        }
      }
      row.push(t);
    }
    map.push(row);
  }
  return map;
}

/* ── 동적 스폰 위치 계산 ── */
function _calcSpawn(count, side, cols, rows) {
  const result=[];
  const spawnRow = side==='ally' ? rows-2 : 1;
  const step = Math.floor(cols / (count+1));
  for (let i=0; i<count; i++) {
    const col = Math.min(step*(i+1), cols-2);
    // 아군 id: 1~count / 적군 id: count+1 ~ count*2
    const id = side==='ally' ? (i+1) : (CONFIG.SQUAD_COUNT + i + 1);
    result.push({ id, col, row: spawnRow });
  }
  return result;
}

/* ── 목표 지점: 맵 중앙 ── */
function _calcObjective() {
  return {
    col: Math.floor(CONFIG.GRID_COLS / 2),
    row: Math.floor(CONFIG.GRID_ROWS / 2),
  };
}

/* ============================================================ */

class GameScene {

  constructor(container) {
    this.container=container;
    this.renderer=this.scene3d=this.camera=this.controls=this.raycaster=null;
    this.gridMap=null;
    this.squads=[]; this.selectedSquad=null; this.pendingCmds=[];
    this.phase='INPUT';
    this.turnManager=this.comms=this.combat=this.enemyAI=null;
    this._animations=[]; this._lastTime=null; this._mouseDownPos=null;
    this.fog=null; this._fogMeshes={}; this._ghostMeshes={};
    this._overlapBadges={};
    this._DEMO_OBJECTIVE = _calcObjective();
    this._pickerOutsideHandler=(e)=>{
      const p=document.getElementById('squad-picker');
      if (p&&!p.contains(e.target)) this._hideSquadPicker();
    };
  }

  init() {
    this._initRenderer(); this._initScene(); this._initSystems();
    this._setupInput();
    window.addEventListener('resize', this._onResize.bind(this));
    window.gameScene=this;
    this.turnManager.startInputPhase();
    const obj=this._DEMO_OBJECTIVE;
    const objLabel=`${String.fromCharCode(65+(obj.col%26))}-${String(obj.row+1).padStart(3,'0')}`;
    chatUI.addLog('OC/T', null, `훈련 개시. 목표: ${objLabel} 점령. 분대 선택 후 이동 타일 클릭.`);
    chatUI.addLog('SYSTEM', null, `맵 250×250 | 아군 ${CONFIG.SQUAD_COUNT}분대 | 적군 ${CONFIG.ENEMY_COUNT}분대`, 'system');
    chatUI.addLog('SYSTEM', null, 'OrbitControls: 마우스 드래그=회전 / 휠=줌 / 우클릭=이동', 'system');
    this._tick();
  }

  _initRenderer() {
    this.renderer=new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x040604,1);
    const w=this.container.clientWidth||512, h=this.container.clientHeight||512;
    this.renderer.setSize(w,h);
    this.container.appendChild(this.renderer.domElement);
  }

  _initScene() {
    const w=this.container.clientWidth||512, h=this.container.clientHeight||512;
    this.scene3d=new THREE.Scene();
    // 250×250 맵은 안개 밀도를 줄임
    this.scene3d.fog=new THREE.FogExp2(0x040604, 0.006);
    this.camera=new THREE.PerspectiveCamera(50, w/h, 0.1, 800);
    // 초기 카메라: 맵 중앙 상공
    this.camera.position.set(0, 120, 100);
    this.camera.lookAt(0, 0, 0);

    try {
      this.controls=new THREE.OrbitControls(this.camera, this.renderer.domElement);
      Object.assign(this.controls, {
        target: new THREE.Vector3(0,0,0),
        enableDamping: true, dampingFactor: 0.08,
        minDistance: 5, maxDistance: 350,
        maxPolarAngle: Math.PI/2.05,
        screenSpacePanning: true,
      });
    } catch(e) { this.controls=null; }

    this.scene3d.add(new THREE.AmbientLight(0x0a2010, 1.2));
    const pl=new THREE.PointLight(0x39ff8e, 1.2, 200);
    pl.position.set(0,60,0); this.scene3d.add(pl);
    const pl2=new THREE.PointLight(0x2277cc, 0.4, 150);
    pl2.position.set(-50,40,50); this.scene3d.add(pl2);
    this.raycaster=new THREE.Raycaster();
  }

  _initSystems() {
    this.gridMap     = new GridMap(this);
    this.comms       = new CommsSystem();
    this.combat      = new CombatSystem();
    this.enemyAI     = new EnemyAI(new GeminiClient(), new FallbackAI());
    this.turnManager = new TurnManager(this);
    this.gridMap.build(_generateMap());
    this._drawObjective();
    this._initSquads();
    this._initFog();
    this._updateFog();
  }

  _initFog() {
    this.fog=new FogOfWar(this.gridMap);
    const gm=this.gridMap;
    // 250×250 = 62,500 타일 → 포그 메시 일괄 생성 (성능 최적화: InstancedMesh 대신 단순 메시)
    for (let r=0; r<CONFIG.GRID_ROWS; r++) {
      for (let c=0; c<CONFIG.GRID_COLS; c++) {
        const h  = gm._tileHeight(gm.tiles[r][c].terrain.id);
        const wx = c*gm.TILE_W+gm.OFFSET_X, wz=r*gm.TILE_W+gm.OFFSET_Z;
        const mesh=new THREE.Mesh(
          new THREE.PlaneGeometry(gm.TILE_W, gm.TILE_W),
          new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})
        );
        mesh.rotation.x=-Math.PI/2; mesh.position.set(wx,h+0.06,wz); mesh.renderOrder=3;
        this.scene3d.add(mesh); this._fogMeshes[`${c},${r}`]=mesh;
      }
    }
    for (const s of this.squads.filter(q=>q.side==='enemy')) {
      const g=_makeTextSprite('?','#882222'); g.scale.set(1.4,1.4,1); g.visible=false;
      this.scene3d.add(g); this._ghostMeshes[s.id]=g;
    }
  }

  _updateFog() {
    if (!this.fog) return;
    this.fog.computeVisible(this.squads.filter(s=>s.side==='ally'&&s.alive));
    const gm=this.gridMap;
    for (let r=0; r<CONFIG.GRID_ROWS; r++)
      for (let c=0; c<CONFIG.GRID_COLS; c++) {
        const m=this._fogMeshes[`${c},${r}`];
        if (m) m.material.opacity=this.fog.isVisible(c,r)?0:0.76;
      }
    for (const s of this.squads.filter(q=>q.side==='enemy')) {
      const inSight=this.fog.isVisible(s.pos.col,s.pos.row);
      if (s.mesh) s.mesh.visible=s.alive&&inSight;
      const ghost=this._ghostMeshes[s.id]; if (!ghost) continue;
      if (inSight&&s.alive) { this.fog.updateLastKnown(s.id,s.pos); ghost.visible=false; }
      else if (s.alive) {
        const lk=this.fog.getLastKnown(s.id);
        if (lk) { const wp=gm.toWorld(lk.col,lk.row); ghost.position.set(wp.x,wp.y+0.6,wp.z); ghost.visible=true; }
      } else ghost.visible=false;
    }
  }

  _drawObjective() {
    const obj=this._DEMO_OBJECTIVE;
    const {x,z}=this.gridMap.toWorld(obj.col, obj.row);
    const tH=this.gridMap._tileHeight(this.gridMap.tiles[obj.row][obj.col].terrain.id);
    const S=0.6;
    const pts=[-S,-S, S,-S, S,S, -S,S, -S,-S].reduce((a,v,i)=>
      (i%2===0?a.push(new THREE.Vector3(x+v,tH+0.04,null)):a[a.length-1].z=z+v,a),[]);
    this.scene3d.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({color:0xffb84d})
    ));
    const star=_makeTextSprite('★','#ffb84d');
    star.position.set(x,tH+1.2,z); star.scale.set(2,2,1); this.scene3d.add(star);
    const lbl=_makeTextSprite('OBJ','#ffb84d');
    lbl.position.set(x,tH+0.6,z); lbl.scale.set(1.2,0.7,1); this.scene3d.add(lbl);
  }

  _initSquads() {
    const allyCnt  = CONFIG.SQUAD_COUNT;
    const enemyCnt = CONFIG.ENEMY_COUNT;
    const cols=CONFIG.GRID_COLS, rows=CONFIG.GRID_ROWS;

    const allySpawns  = _calcSpawn(allyCnt,  'ally',  cols, rows);
    const enemySpawns = _calcSpawn(enemyCnt, 'enemy', cols, rows);

    for (const d of allySpawns)  { const s=this._makeSquad(d.id,'ally', d.col,d.row); this.squads.push(s); this._createMesh(s); }
    for (const d of enemySpawns) { const s=this._makeSquad(d.id,'enemy',d.col,d.row); this.squads.push(s); this._createMesh(s); }

    // 좌측 패널 동적 생성
    this._buildSquadPanel();
    this._syncPanel();
    this._updateOverlapVisuals();
  }

  /* ── 좌측 패널 분대 카드 동적 생성 ── */
  _buildSquadPanel() {
    const list=document.getElementById('squad-list');
    if (!list) return;
    list.innerHTML='';
    const allies=this.squads.filter(s=>s.side==='ally');
    allies.forEach((squad,i)=>{
      const cd=squad._colDef||this._squadColor(squad);
      const card=document.createElement('div');
      card.className='squad-card'+(i===0?' active':'');
      card.dataset.squadId=squad.id;
      card.style.borderLeft=`3px solid ${cd.css}`;
      card.innerHTML=`
        <div class="squad-card-header">
          <span class="squad-badge" style="color:${cd.css};border-color:${cd.css}">A${squad.id}분대</span>
          <span class="squad-status-tag">대기</span>
        </div>
        <div class="squad-troops">병력 <span>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</span> &nbsp;|&nbsp; AP <span>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</span></div>
        <div class="comms-row">
          <span class="comms-label">통신</span>
          <div class="stat-bar"><div class="stat-fill" style="width:100%"></div></div>
          <span class="comms-val">100%</span>
        </div>`;
      card.addEventListener('click', ()=>this.selectSquadById(squad.id));
      list.appendChild(card);
    });
  }

  _makeSquad(id, side, col, row) {
    return { id, side, pos:{col,row}, troops:CONFIG.SQUAD_TROOP_MAX,
             ap:CONFIG.SQUAD_AP_MAX, terrain:CONFIG.TERRAIN.OPEN,
             alive:true, mesh:null, mat:null, boxMesh:null };
  }

  _squadColor(squad) {
    return squad.side==='enemy'
      ? ENEMY_COLOR_DEF
      : ALLY_COLOR_DEFS[(squad.id-1) % ALLY_COLOR_DEFS.length];
  }

  _createMesh(squad) {
    const {x,y,z}=this.gridMap.toWorld(squad.pos.col, squad.pos.row);
    const cd=this._squadColor(squad);
    const isAlly=squad.side==='ally';
    const label=isAlly?`A${squad.id}`:`E${squad.id-CONFIG.SQUAD_COUNT}`;
    const group=new THREE.Group();

    // 250×250에서 잘 보이도록 박스 크기 1.0으로 확대
    const geo=new THREE.BoxGeometry(1.0, 0.7, 1.0);
    const mat=new THREE.MeshLambertMaterial({color:cd.hex,transparent:true,opacity:0.90});
    const box=new THREE.Mesh(geo,mat);
    box.userData={squadId:squad.id};
    group.add(box);

    const edgeLines=new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({color:cd.hex,transparent:true,opacity:0.9})
    );
    edgeLines.raycast=()=>{};
    group.add(edgeLines);

    const sprite=_makeSquadLabelSprite(label,cd.css,cd.bg);
    sprite.position.set(0,1.2,0);
    sprite.scale.set(2.0,0.9,1);
    sprite.raycast=()=>{};
    group.add(sprite);

    group.position.set(x,y,z);
    group.userData={squadId:squad.id};
    this.scene3d.add(group);
    squad.mesh=group; squad.mat=mat; squad.boxMesh=box; squad._colDef=cd;
  }

  /* ────────── 겹침 ────────── */
  _getSquadsOnTile(col,row,side=null) {
    return this.squads.filter(s=>s.alive&&s.pos.col===col&&s.pos.row===row&&(side===null||s.side===side));
  }

  _calcOffsets(count) {
    const D=0.6;
    if (count===2) return [{dx:-D,dz:0},{dx:D,dz:0}];
    if (count===3) return [{dx:-D,dz:-D*.5},{dx:D,dz:-D*.5},{dx:0,dz:D*.9}];
    return Array.from({length:count},(_,i)=>({
      dx:i%2===0?-D:D, dz:(Math.floor(i/2)-(Math.ceil(count/2)-1)/2)*D*1.2,
    }));
  }

  _updateOverlapVisuals() {
    if (!this.scene3d||!this.gridMap) return;
    for (const b of Object.values(this._overlapBadges)) {
      this.scene3d.remove(b); b.material?.map?.dispose(); b.material?.dispose();
    }
    this._overlapBadges={};
    const groups={};
    for (const s of this.squads.filter(q=>q.alive&&q.mesh)) {
      const key=`${s.pos.col},${s.pos.row}`;
      (groups[key]=groups[key]||[]).push(s);
    }
    for (const [key,list] of Object.entries(groups)) {
      const [col,row]=key.split(',').map(Number);
      const base=this.gridMap.toWorld(col,row);
      if (list.length===1) { list[0].mesh.position.set(base.x,base.y,base.z); }
      else {
        const off=this._calcOffsets(list.length);
        list.forEach((s,i)=>s.mesh.position.set(base.x+off[i].dx,base.y,base.z+off[i].dz));
        const badge=_makeTextSprite(`×${list.length}`,'#ffb84d');
        badge.position.set(base.x,base.y+2.0,base.z);
        badge.scale.set(1.2,0.7,1); badge.renderOrder=10;
        this.scene3d.add(badge); this._overlapBadges[key]=badge;
      }
    }
  }

  /* ────────── 피커 팝업 ────────── */
  _showSquadPicker(squads,clientX,clientY) {
    const picker=document.getElementById('squad-picker');
    if (!picker) return;
    this._hideSquadPicker();
    const col=squads[0].pos.col, row=squads[0].pos.row;
    const coord=`${String.fromCharCode(65+(col%26))}-${String(row+1).padStart(3,'0')}`;
    const title=document.createElement('div');
    title.className='picker-title';
    title.innerHTML=`<span class="picker-icon">⚡</span> ${coord} 겹침 — 분대 선택`;
    picker.appendChild(title);
    squads.forEach((squad)=>{
      const cd=squad._colDef||this._squadColor(squad);
      const q=this._quality(squad);
      const hasCmd=!!this.pendingCmds.find(c=>c.squadId===squad.id);
      const qColor=q<50?'#ff4444':q<70?'#ffb84d':cd.css;
      const card=document.createElement('div');
      card.className='picker-card'+(this.selectedSquad?.id===squad.id?' picker-card-selected':'');
      card.innerHTML=`
        <div class="picker-card-stripe" style="background:${cd.css}"></div>
        <div class="picker-card-content">
          <div class="picker-card-header">
            <span class="picker-card-name" style="color:${cd.css}">A${squad.id}분대</span>
            ${hasCmd?`<span class="picker-cmd-tag">명령↑</span>`:''}
          </div>
          <div class="picker-card-row">
            <span class="picker-stat-item">병력 <b>${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}</b></span>
            <span class="picker-stat-item">AP <b>${squad.ap}/${CONFIG.SQUAD_AP_MAX}</b></span>
            <span class="picker-stat-item" style="color:${qColor}">통신 <b>${q}%</b></span>
          </div>
        </div>
        <div class="picker-card-arrow">▶</div>`;
      card.addEventListener('click',(e)=>{ e.stopPropagation(); this._hideSquadPicker(); this.selectSquad(squad); });
      picker.appendChild(card);
    });
    const closeBtn=document.createElement('div');
    closeBtn.className='picker-close'; closeBtn.innerHTML='✕&nbsp;&nbsp;닫기';
    closeBtn.addEventListener('click',(e)=>{ e.stopPropagation(); this._hideSquadPicker(); });
    picker.appendChild(closeBtn);
    const rect=this.container.getBoundingClientRect();
    const PW=224, PH=48+squads.length*76+38;
    picker.style.left=Math.min(clientX-rect.left+14, rect.width-PW-6)+'px';
    picker.style.top=Math.min(clientY-rect.top+14, rect.height-PH-6)+'px';
    picker.style.display='block';
    setTimeout(()=>document.addEventListener('click',this._pickerOutsideHandler),80);
    chatUI.addLog('SYSTEM',null,`⚠ ${coord} — ${squads.length}개 분대 겹침.`,'system');
  }

  _hideSquadPicker() {
    const p=document.getElementById('squad-picker');
    if (p) { p.style.display='none'; p.innerHTML=''; }
    document.removeEventListener('click',this._pickerOutsideHandler);
  }

  /* ────────── 분대 선택 ────────── */
  selectSquad(squad) {
    if (this.phase!=='INPUT'||!squad.alive) return;
    this._hideSquadPicker();
    this._cancelCmd(squad);
    if (this.selectedSquad?.mesh) {
      if (this.selectedSquad.mat) { this.selectedSquad.mat.emissive=new THREE.Color(0); this.selectedSquad.mat.opacity=0.90; }
      this.selectedSquad.mesh.scale.set(1,1,1);
    }
    this.selectedSquad=squad;
    const cd=squad._colDef||this._squadColor(squad);
    squad.mat.emissive=new THREE.Color(cd.emissive);
    squad.mat.opacity=1.0;
    squad.mesh.scale.set(1.25,1.25,1.25);
    this.gridMap.clearHighlights();
    this._showMoveTargets(squad);
    this._syncPanel();
    const pos=`${String.fromCharCode(65+(squad.pos.col%26))}-${String(squad.pos.row+1).padStart(3,'0')}`;
    chatUI.addLog('SYSTEM',null,`A${squad.id}분대 선택 — 위치:${pos} | AP:${squad.ap}/${CONFIG.SQUAD_AP_MAX} | 통신:${this._quality(squad)}%`,'system');
  }

  selectSquadById(id) {
    const s=this.squads.find(q=>q.side==='ally'&&q.id===id);
    if (s) this.selectSquad(s);
  }

  _showMoveTargets(squad) {
    for (let r=0; r<CONFIG.GRID_ROWS; r++)
      for (let c=0; c<CONFIG.GRID_COLS; c++) {
        const dist=Math.abs(c-squad.pos.col)+Math.abs(r-squad.pos.row);
        if (dist===0||dist>squad.ap) continue;
        if ((this.gridMap.tiles[r][c].terrain.moveCost||1)>squad.ap) continue;
        const stack=this._getSquadsOnTile(c,r,'ally').length;
        this.gridMap.highlightTile(c,r,stack>0?0xffb84d:0x39ff8e,stack>0?0.30:0.18);
      }
    for (const e of this.squads.filter(q=>q.side==='enemy'&&q.alive))
      if (this.combat.inRange(squad.pos,e.pos))
        this.gridMap.highlightTile(e.pos.col,e.pos.row,0xff4444,0.38);
  }

  _clearSelection() {
    if (this.selectedSquad?.mat) {
      this.selectedSquad.mat.emissive=new THREE.Color(0);
      this.selectedSquad.mat.opacity=0.90;
      this.selectedSquad.mesh.scale.set(1,1,1);
    }
    this.selectedSquad=null;
    this.gridMap.clearHighlights();
    this._syncPanel();
  }

  /* ────────── 명령: 이동 ────────── */
  _issueMove(squad,targetPos) {
    const dist=Math.abs(targetPos.col-squad.pos.col)+Math.abs(targetPos.row-squad.pos.row);
    if (dist===0) return;
    const cost=this.gridMap.tiles[targetPos.row][targetPos.col].terrain.moveCost||1;
    if (cost>squad.ap) { chatUI.addLog('SYSTEM',null,`AP 부족(필요:${cost},보유:${squad.ap})`,'system'); return; }
    if (dist>squad.ap) { chatUI.addLog('SYSTEM',null,`이동 거리 초과(거리:${dist},AP:${squad.ap})`,'system'); return; }
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res=this.comms.applyMishear({type:'move',squadId:squad.id,targetTile:targetPos,targetPos},this.squads,squad);
      if (res.distorted) {
        chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
        if (res.mishearType==='ignore') { chatUI.addLog(`A${squad.id}`,null,'⚡ 명령 미수신 — 대기','system'); this._clearSelection(); return; }
        if (res.mishearType==='attack_instead') {
          const target=this.squads.find(s=>s.id===res.command.targetId&&s.alive);
          if (target&&squad.ap>=1) {
            this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});
            squad.ap-=1;
            chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 → E${target.id-CONFIG.SQUAD_COUNT}분대 사격으로 둔갑`);
            this.gridMap.clearHighlights();
            this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);
          } else { chatUI.addLog(`A${squad.id}`,null,'⚡ 오청(사격 둔갑) — AP 부족으로 대기','system'); }
          this._clearSelection(); return;
        }
        if (res.mishearType==='coord') {
          const distPos=res.command.targetTile;
          const distCost=this.gridMap.tiles[distPos.row][distPos.col].terrain.moveCost||1;
          const distDist=Math.abs(distPos.col-squad.pos.col)+Math.abs(distPos.row-squad.pos.row);
          if (distDist>0&&distCost<=squad.ap&&distDist<=squad.ap) {
            this.pendingCmds.push({type:'move',squadId:squad.id,targetPos:distPos});
            squad.ap-=distCost;
            this.gridMap.clearHighlights();
            this.gridMap.highlightTile(distPos.col,distPos.row,0xffb84d,0.50);
            chatUI.addLog(`A${squad.id}`,null,`⚡ 오청 이동 → ${String.fromCharCode(65+(distPos.col%26))}-${String(distPos.row+1).padStart(3,'0')}`);
          } else { chatUI.addLog(`A${squad.id}`,null,'⚡ 오청 좌표 이동 불가 → 대기','system'); }
          this._clearSelection(); return;
        }
      }
    }
    this.pendingCmds.push({type:'move',squadId:squad.id,targetPos});
    squad.ap-=cost;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(targetPos.col,targetPos.row,0x39ff8e,0.50);
    chatUI.addLog(`A${squad.id}`,null,`이동 → ${String.fromCharCode(65+(targetPos.col%26))}-${String(targetPos.row+1).padStart(3,'0')}`);
    this._clearSelection();
  }

  /* ────────── 명령: 사격 ────────── */
  _issueAttack(squad,target) {
    if (!this.combat.inRange(squad.pos,target.pos)) { chatUI.addLog('SYSTEM',null,`사거리 밖(최대${CONFIG.RIFLE_RANGE}타일)`,'system'); return; }
    if (squad.ap<1) { chatUI.addLog('SYSTEM',null,'AP 부족 — 사격 불가','system'); return; }
    this._cancelCmd(squad);
    const quality=this._quality(squad);
    if (this.comms.rollMishear(quality)) {
      const res=this.comms.applyMishear({type:'attack',squadId:squad.id,targetId:target.id},this.squads,squad);
      if (res.distorted&&res.mishearType==='ignore') {
        chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
        chatUI.addLog(`A${squad.id}`,null,'⚡ 사격 명령 미수신 — 대기','system');
        this._clearSelection(); return;
      }
      if (res.distorted) chatUI.showMishear(res.originalText,res.distortedText,res.mishearType);
    }
    this.pendingCmds.push({type:'attack',squadId:squad.id,targetId:target.id});
    squad.ap-=1;
    this.gridMap.clearHighlights();
    this.gridMap.highlightTile(target.pos.col,target.pos.row,0xff4444,0.50);
    chatUI.addLog(`A${squad.id}`,null,`E${target.id-CONFIG.SQUAD_COUNT}분대 사격 명령`);
    this._clearSelection();
  }

  _cancelCmd(squad) {
    const idx=this.pendingCmds.findIndex(c=>c.squadId===squad.id);
    if (idx<0) return;
    const old=this.pendingCmds[idx];
    if (old.type==='move') squad.ap+=(this.gridMap.tiles[old.targetPos.row][old.targetPos.col].terrain.moveCost||1);
    else if (old.type==='attack') squad.ap+=1;
    this.pendingCmds.splice(idx,1);
  }

  /* ────────── 이동 애니메이션 ────────── */
  moveSquadTo(squad,targetPos,onDone) {
    const from={x:squad.mesh.position.x,y:squad.mesh.position.y,z:squad.mesh.position.z};
    const to=this.gridMap.toWorld(targetPos.col,targetPos.row);
    this._animations.push({
      type:'move', squad, from, to, duration:0.32, elapsed:0,
      onComplete:()=>{
        squad.pos={...targetPos};
        squad.terrain=this.gridMap.tiles[targetPos.row][targetPos.col].terrain;
        squad.mesh.position.set(to.x,to.y,to.z);
        this._updateOverlapVisuals();
        if (onDone) onDone();
      },
    });
  }

  /* ────────── 교전 ────────── */
  applyHit(attacker,target) {
    const terrain=this.gridMap.tiles[target.pos.row][target.pos.col].terrain;
    const hit=this.combat.rollHit(attacker.pos,target.pos,terrain);
    const aLbl=attacker.side==='ally'?`A${attacker.id}`:`E${attacker.id-CONFIG.SQUAD_COUNT}`;
    const tLbl=target.side==='ally'?`A${target.id}분대`:`E${target.id-CONFIG.SQUAD_COUNT}분대`;
    if (hit) {
      target.troops=Math.max(0,target.troops-1);
      chatUI.addLog(aLbl,null,`${tLbl} 명중! (잔여:${target.troops}명)`);
      if (target.mat) {
        let n=0;
        const flash=()=>{ if (!target.mat) return; target.mat.opacity=n++%2===0?0.15:0.90; if (n<6) setTimeout(flash,90); else target.mat.opacity=0.90; };
        flash();
      }
      if (target.troops<=0) {
        target.alive=false;
        setTimeout(()=>{ if (target.mesh) target.mesh.visible=false; this._updateOverlapVisuals(); },590);
        chatUI.addLog('SYSTEM',null,`${tLbl} 전멸`,'system');
      }
    } else { chatUI.addLog(aLbl,null,'사격 — 빗나감'); }
  }

  /* ────────── 패널 동기화 ────────── */
  _syncPanel() {
    const allies=this.squads.filter(s=>s.side==='ally');
    document.querySelectorAll('.squad-card').forEach((card)=>{
      const sid=parseInt(card.dataset.squadId);
      const squad=allies.find(s=>s.id===sid);
      if (!squad) return;
      const spans=card.querySelectorAll('.squad-troops span');
      if (spans[0]) spans[0].textContent=`${squad.troops}/${CONFIG.SQUAD_TROOP_MAX}`;
      if (spans[1]) spans[1].textContent=`${squad.ap}/${CONFIG.SQUAD_AP_MAX}`;
      const q=this._quality(squad);
      const fill=card.querySelector('.stat-fill'), cVal=card.querySelector('.comms-val');
      if (fill) { fill.style.width=q+'%'; fill.className='stat-fill'+(q<50?' crit':q<CONFIG.COMMS_QUALITY_THRESHOLD?' warn':''); }
      if (cVal) cVal.textContent=q+'%';
      const tag=card.querySelector('.squad-status-tag');
      const hasCmd=!!this.pendingCmds.find(c=>c.squadId===squad.id);
      const stack=squad.alive?this._getSquadsOnTile(squad.pos.col,squad.pos.row,'ally').length:0;
      if (tag) {
        if      (!squad.alive)                        { tag.textContent='전멸';           tag.className='squad-status-tag combat'; }
        else if (q<40)                                { tag.textContent='통신두절';       tag.className='squad-status-tag nocomms'; }
        else if (this.selectedSquad?.id===squad.id)   { tag.textContent='선택됨';         tag.className='squad-status-tag moving'; }
        else if (hasCmd)                              { tag.textContent='명령↑';          tag.className='squad-status-tag moving'; }
        else if (stack>1)                             { tag.textContent=`겹침(${stack})`; tag.className='squad-status-tag nocomms'; }
        else                                          { tag.textContent='대기';            tag.className='squad-status-tag'; }
      }
      const cd=squad._colDef||this._squadColor(squad);
      card.style.borderLeft=`3px solid ${cd.css}`;
      card.classList.toggle('active',this.selectedSquad?.id===squad.id);
    });
    const allyInValley=this.squads.some(s=>s.side==='ally'&&s.alive&&s.terrain?.id==='valley');
    const tw=document.getElementById('terrain-row');
    if (tw) tw.style.display=allyInValley?'':'none';
    const batEl=document.querySelector('.commander-block .resource-val');
    if (batEl) { const b=this.comms.batteryLevel; batEl.textContent=b+'%'; batEl.className='resource-val'+(b<30?' crit':b<50?' warn':''); }
  }

  _quality(squad) { return this.comms?Math.round(this.comms.calcQuality({terrain:squad.terrain})):100; }

  /* ────────── 입력 ────────── */
  _setupInput() {
    const cv=this.renderer.domElement;
    cv.style.pointerEvents='auto';
    cv.addEventListener('pointerdown',(e)=>{ this._mouseDownPos={x:e.clientX,y:e.clientY}; });
    cv.addEventListener('pointerup',(e)=>{
      if (!this._mouseDownPos) return;
      const dx=Math.abs(e.clientX-this._mouseDownPos.x), dy=Math.abs(e.clientY-this._mouseDownPos.y);
      this._mouseDownPos=null;
      if (dx<6&&dy<6) this._onCanvasClick(e);
    });
    cv.addEventListener('pointermove',(e)=>{
      const hit=this._raycastTile(e);
      if (hit) {
        const el=document.getElementById('hud-coord');
        if (el) el.textContent=`${String.fromCharCode(65+(hit.col%26))}-${String(hit.row+1).padStart(3,'0')}`;
      }
    });
  }

  _onCanvasClick(e) {
    if (this.phase!=='INPUT') return;
    this._hideSquadPicker();
    const mouse=this._toNDC(e);
    this.raycaster.setFromCamera(mouse,this.camera);
    const hits=this.raycaster.intersectObjects(this.squads.filter(s=>s.alive&&s.boxMesh).map(s=>s.boxMesh),false);
    if (hits.length>0) {
      const {squadId}=hits[0].object.userData;
      const clicked=this.squads.find(s=>s.id===squadId&&s.alive);
      if (clicked) {
        if (clicked.side==='ally') {
          const colocated=this._getSquadsOnTile(clicked.pos.col,clicked.pos.row,'ally');
          if (colocated.length>1) { this._showSquadPicker(colocated,e.clientX,e.clientY); return; }
          else { this.selectSquad(clicked); return; }
        }
        if (this.selectedSquad) { this._issueAttack(this.selectedSquad,clicked); return; }
      }
    }
    const tHits=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    if (tHits.length===0) return;
    const {col,row}=tHits[0].object.userData;
    const allies=this._getSquadsOnTile(col,row,'ally');
    if (allies.length>1) { this._showSquadPicker(allies,e.clientX,e.clientY); return; }
    if (allies.length===1) { this.selectSquad(allies[0]); return; }
    if (!this.selectedSquad) return;
    const enemy=this.squads.find(q=>q.side==='enemy'&&q.alive&&q.pos.col===col&&q.pos.row===row);
    if (enemy) { this._issueAttack(this.selectedSquad,enemy); return; }
    this._issueMove(this.selectedSquad,{col,row});
  }

  _toNDC(e) {
    const r=this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  }

  _raycastTile(e) {
    this.raycaster.setFromCamera(this._toNDC(e),this.camera);
    const h=this.raycaster.intersectObjects(this.gridMap.getTileMeshes());
    return h.length?h[0].object.userData:null;
  }

  _onResize() {
    const w=this.container.clientWidth, h=this.container.clientHeight;
    if (!w||!h) return;
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w,h);
  }

  _updateAnimations(delta) {
    const done=[];
    for (const a of this._animations) {
      a.elapsed+=delta;
      const t=Math.min(a.elapsed/a.duration,1);
      const e=t<0.5?2*t*t:-1+(4-2*t)*t;
      if (a.type==='move') {
        a.squad.mesh.position.x=a.from.x+(a.to.x-a.from.x)*e;
        a.squad.mesh.position.z=a.from.z+(a.to.z-a.from.z)*e;
        a.squad.mesh.position.y=a.from.y+(a.to.y-a.from.y)*e+Math.sin(Math.PI*t)*0.8;
      }
      if (t>=1) { done.push(a); a.onComplete?.(); }
    }
    this._animations=this._animations.filter(a=>!done.includes(a));
  }

  _tick(ts) {
    requestAnimationFrame(this._tick.bind(this));
    const delta=Math.min(((ts||0)-(this._lastTime||ts||0))/1000,0.1);
    this._lastTime=ts||0;
    this._updateAnimations(delta);
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene3d,this.camera);
  }
}
