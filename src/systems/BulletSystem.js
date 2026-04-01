/* ============================================================
   BulletSystem.js — 총알 발사 시각 효과
   ────────────────────────────────────────────────────────────
   · 사격 시 발사자 → 대상 방향으로 총알 궤적 생성
   · 소총: 얇은 녹색 선 / 기관총: 굵은 황색 선 / 박격포: 곡선 포물선
   · 총알은 0.15~0.3초 내에 목표 도달 후 소멸
   · 명중 시 목표 위치에 파티클(임팩트) 이펙트
   ============================================================ */

class BulletSystem {

  constructor(scene3d, gridMap) {
    this._scene3d  = scene3d;
    this._gridMap  = gridMap;
    /** @type {Array<BulletData>} 활성 총알 목록 */
    this._bullets  = [];
    /** @type {Array<ImpactData>} 활성 임팩트 목록 */
    this._impacts  = [];
  }

  /* ── 총알 발사 ── */
  /**
   * @param {{ col, row }} fromPos  - 발사자 위치
   * @param {{ col, row }} toPos    - 목표 위치
   * @param {string}       unitType - 'rifle' | 'machine_gun' | 'mortar'
   * @param {boolean}      hit      - 명중 여부
   */
  fire(fromPos, toPos, unitType = 'rifle', hit = true) {
    const gm  = this._gridMap;
    const TW  = gm.TILE_W;
    const fromH = gm.tiles[fromPos.row][fromPos.col].height;
    const toH   = gm.tiles[toPos.row][toPos.col].height;

    const from = {
      x: fromPos.col * TW + gm.OFFSET_X,
      y: fromH + TW * 0.5,
      z: fromPos.row * TW + gm.OFFSET_Z,
    };
    const to = {
      x: toPos.col * TW + gm.OFFSET_X,
      y: toH + TW * 0.5,
      z: toPos.row * TW + gm.OFFSET_Z,
    };

    if (unitType === 'mortar') {
      this._fireMortar(from, to, hit);
    } else {
      this._fireBullet(from, to, unitType, hit);
    }
  }

  /* ── 소총 / 기관총 직선 총알 ── */
  _fireBullet(from, to, unitType, hit) {
    const isMG = (unitType === 'machine_gun' || unitType === 'mg');

    // 색상 & 굵기
    const color    = isMG ? 0xffb84d : 0x88ffaa;
    const width    = isMG ? 3        : 1.5;
    const duration = isMG ? 0.20     : 0.15;
    const count    = isMG ? 3        : 1; // 기관총은 3발 연속

    for (let i = 0; i < count; i++) {
      const delay = i * 0.06;

      // 약간의 스프레드
      const spread = 0.015;
      const jitter = {
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread,
      };

      const fromV = new THREE.Vector3(from.x, from.y, from.z);
      const toV   = new THREE.Vector3(
        to.x + jitter.x, to.y + jitter.y, to.z + jitter.z
      );

      // 총알 라인 생성
      const points  = [fromV, fromV.clone()]; // 처음엔 길이 0
      const geo     = new THREE.BufferGeometry().setFromPoints(points);
      const mat     = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.85,
        linewidth: width,  // WebGL에서는 1로 고정되지만 기록용
      });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 10;
      this._scene3d.add(line);

      const bullet = {
        type:     'bullet',
        line,
        geo,
        mat,
        fromV,
        toV,
        duration,
        elapsed:  -delay,
        hit,
        toPos:    to,
        unitType,
        done:     false,
      };
      this._bullets.push(bullet);
    }
  }

  /* ── 박격포 포물선 궤적 ── */
  _fireMortar(from, to, hit) {
    const points = this._arcPoints(from, to, 12);
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(from.x, from.y, from.z)) // 초기엔 발사점
    );
    const mat  = new THREE.LineBasicMaterial({ color: 0xcc80ff, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 10;
    this._scene3d.add(line);

    this._bullets.push({
      type:    'mortar',
      line, geo, mat,
      from, to,
      arcPoints: points,
      duration:  0.55,
      elapsed:   0,
      hit,
      toPos:     to,
      done:      false,
    });
  }

  /* ── 포물선 포인트 생성 ── */
  _arcPoints(from, to, steps) {
    const pts = [];
    const apex = 0.8; // 최고 높이 배율
    const dist = Math.sqrt(
      (to.x-from.x)**2 + (to.z-from.z)**2
    );
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      const arcH = Math.sin(Math.PI * t) * dist * apex;
      const y = from.y + (to.y - from.y) * t + arcH;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }

  /* ── 매 프레임 업데이트 (GameScene._tick에서 호출) ── */
  update(delta) {
    const done = [];

    for (const b of this._bullets) {
      b.elapsed += delta;
      if (b.elapsed < 0) continue; // delay 대기 중

      const t = Math.min(b.elapsed / b.duration, 1);

      if (b.type === 'bullet') {
        this._updateBullet(b, t);
      } else if (b.type === 'mortar') {
        this._updateMortar(b, t);
      }

      // 명중 시 임팩트 생성 (t=1 도달 시)
      if (t >= 1 && !b._impactSpawned) {
        b._impactSpawned = true;
        if (b.hit) this._spawnImpact(b.toPos, b.unitType || 'rifle');
        done.push(b);
      }
    }

    // 완료된 총알 제거
    for (const b of done) {
      this._scene3d.remove(b.line);
      b.geo.dispose();
      b.mat.dispose();
      this._bullets = this._bullets.filter(x => x !== b);
    }

    // 임팩트 업데이트
    this._updateImpacts(delta);
  }

  _updateBullet(b, t) {
    // 총알: 발사점에서 목표로 이동하는 짧은 선분
    const trailLen = 0.3; // 선 길이 비율
    const tailT    = Math.max(0, t - trailLen);

    const headX = b.fromV.x + (b.toV.x - b.fromV.x) * t;
    const headY = b.fromV.y + (b.toV.y - b.fromV.y) * t;
    const headZ = b.fromV.z + (b.toV.z - b.fromV.z) * t;

    const tailX = b.fromV.x + (b.toV.x - b.fromV.x) * tailT;
    const tailY = b.fromV.y + (b.toV.y - b.fromV.y) * tailT;
    const tailZ = b.fromV.z + (b.toV.z - b.fromV.z) * tailT;

    const positions = b.geo.attributes.position;
    positions.setXYZ(0, tailX, tailY, tailZ);
    positions.setXYZ(1, headX, headY, headZ);
    positions.needsUpdate = true;

    // 페이드아웃
    b.mat.opacity = t < 0.7 ? 0.85 : 0.85 * (1 - (t - 0.7) / 0.3);
  }

  _updateMortar(b, t) {
    // 박격포: 포물선 경로를 따라 이동하며 궤적 표시
    const steps = b.arcPoints.length;
    const curIdx = Math.floor(t * (steps - 1));
    const pts = b.arcPoints.slice(0, curIdx + 1);
    if (pts.length < 2) return;

    b.geo.setFromPoints(pts);
    b.geo.attributes.position.needsUpdate = true;
    b.mat.opacity = 0.75;
  }

  /* ── 임팩트 이펙트 ── */
  _spawnImpact(toPos, unitType) {
    const isMortar = (unitType === 'mortar');
    const color    = isMortar ? 0xcc80ff : 0xff8844;
    const size     = isMortar ? 0.25     : 0.12;
    const duration = isMortar ? 0.5      : 0.25;

    const gm = this._gridMap;
    if (!gm) return;
    const col = Math.max(0, Math.min(CONFIG.GRID_COLS-1, Math.round((toPos.x - gm.OFFSET_X) / gm.TILE_W)));
    const row = Math.max(0, Math.min(CONFIG.GRID_ROWS-1, Math.round((toPos.z - gm.OFFSET_Z) / gm.TILE_W)));
    if (!gm.isInBounds(col, row)) return;
    const h = gm.tiles[row][col].height;

    // 파티클: 방사형으로 퍼지는 여러 선분
    const lines = [];
    const count = isMortar ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const geo    = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(toPos.x, h + 0.05, toPos.z),
        new THREE.Vector3(
          toPos.x + Math.cos(angle) * size,
          h + 0.05 + Math.random() * size * 0.5,
          toPos.z + Math.sin(angle) * size
        ),
      ]);
      const mat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 11;
      this._scene3d.add(line);
      lines.push({ line, geo, mat, angle, size });
    }

    this._impacts.push({ lines, duration, elapsed: 0, baseColor: color });
  }

  _updateImpacts(delta) {
    const done = [];
    for (const imp of this._impacts) {
      imp.elapsed += delta;
      const t = Math.min(imp.elapsed / imp.duration, 1);
      const opacity = 1 - t;

      for (const l of imp.lines) {
        l.mat.opacity = opacity * 0.9;
        // 선 길이 확장
        const pos = l.geo.attributes.position;
        const scale = 1 + t * 1.5;
        const angle = l.angle;
        const sz    = l.size * scale;
        pos.setXYZ(1,
          pos.getX(0) + Math.cos(angle) * sz,
          pos.getY(0) + Math.random() * sz * 0.3,
          pos.getZ(0) + Math.sin(angle) * sz
        );
        pos.needsUpdate = true;
      }

      if (t >= 1) done.push(imp);
    }

    for (const imp of done) {
      for (const l of imp.lines) {
        this._scene3d.remove(l.line);
        l.geo.dispose();
        l.mat.dispose();
      }
      this._impacts = this._impacts.filter(x => x !== imp);
    }
  }
}
