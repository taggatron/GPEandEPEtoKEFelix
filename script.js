// Felix Baumgartner freefall energy simulation
// GCSE-level, with optional drag and variable gravity

(function(){
  const g0 = 9.80665; // m/s^2
  const R = 6_371_000; // Earth radius (m)

  const $ = (id) => document.getElementById(id);
  const fmt = (x, unit="") => {
    if (!isFinite(x)) return "—";
    const abs = Math.abs(x);
    let s;
    if (abs >= 1e9) s = (x/1e9).toFixed(2)+" G";
    else if (abs >= 1e6) s = (x/1e6).toFixed(2)+" M";
    else if (abs >= 1e3) s = (x/1e3).toFixed(2)+" k";
    else s = x.toFixed(2);
    return `${s} ${unit}`.trim();
  };

  function rhoAt(h, rho0, H){
    // Simple exponential atmosphere
    return rho0 * Math.exp(-Math.max(0,h) / H);
  }

  function gAt(h, gravityModel){
    if (gravityModel === 'simplified') return 10.0;
    return g0 * (R/(R + Math.max(0,h)))**2;
  }

  function getScenario(){
    const btnCat = document.getElementById('btnCatapult');
    return btnCat && btnCat.classList.contains('active') ? 'catapult' : 'freefall';
  }

  function simulate(params){
    const { m, h0, dt, withDrag, gravityModel, Cd, A, rho0, H, scenario, springK=0, springX=0, launchAngleDeg=45 } = params;

    // State variables (downwards positive for velocity, height is above ground)
    let t = 0;
    if (scenario === 'catapult'){
      // 2D projectile motion from ground at ~45°; use total speed for KE and drag
      let x = 0, y = 0;
      const epe = 0.5 * springK * springX * springX; // J
  const v0 = Math.sqrt(Math.max(0, 2*epe / m));
  const ang = (launchAngleDeg * Math.PI)/180;
  let vx = v0 * Math.cos(ang);
  let vy = v0 * Math.sin(ang);
      const ts = [], gpes = [], kes = [], diss = [], vs = [], hs = [], xs = [];
      let eD = 0;
      let vMax = 0, keMax = 0;
      while (t < 2000 && (y >= 0)){
        const rho = rhoAt(y, rho0, H);
        const g = gAt(y, gravityModel);
        const speed = Math.max(1e-8, Math.hypot(vx, vy));
        const Fd = withDrag ? 0.5 * rho * Cd * A * speed*speed : 0;
        const ax = Fd ? -(Fd/m) * (vx / speed) : 0;
        const ay = -g + (Fd ? -(Fd/m) * (vy / speed) : 0);

        // Integrate
        vx += ax * dt;
        vy += ay * dt;
        x += vx * dt;
        y = Math.max(0, y + vy * dt);

        const ke = 0.5 * m * (vx*vx + vy*vy);
        const gpe = m * g * y;
        eD += Fd * speed * dt;
        vMax = Math.max(vMax, speed);
        keMax = Math.max(keMax, ke);

        ts.push(t); xs.push(x); hs.push(y); vs.push(speed); gpes.push(gpe); kes.push(ke); diss.push(eD);
        t += dt;
        if (y === 0 && vy < 0) break; // impact ground on descent
      }
      return { tEnd: t, vEnd: vs[vs.length-1] || 0, keMax, vMax, eDiss: diss[diss.length-1]||0, series: { t: ts, gpe: gpes, ke: kes, ediss: diss, v: vs, h: hs, x: xs }, endLabel: 'ground' };
    } else {
      // 1D freefall
      let h = h0;        // altitude (m)
      let v = 0;         // downward speed (m/s)
      let keMax = 0;
      let vMax = 0;
      const ts = [], gpes = [], kes = [], diss = [], vs = [], hs = [];
      let energyDissipated = 0; // thermal due to drag

      while (h > 0 && t < 2000){
        const g = gAt(h, gravityModel);
        const rho = rhoAt(h, rho0, H);

        // Forces along vertical (down positive)
        const weight = m * g; // downwards
        let drag = 0;
        if (withDrag){ drag = 0.5 * rho * Cd * A * v*v; }
        const a = (weight - drag * Math.sign(v)) / m;

        // Semi-implicit Euler
        const vNext = v + a * dt;
        const hNext = Math.max(0, h - ((v + vNext)/2) * dt);

        const ke = 0.5 * m * vNext*vNext;
        keMax = Math.max(keMax, ke);
        vMax = Math.max(vMax, Math.abs(vNext));
        if (withDrag){
          const Fd = 0.5 * rho * Cd * A * v*v;
          const powerLoss = Fd * Math.abs(v);
          energyDissipated += powerLoss * dt;
        }

        ts.push(t);
        const gpe = m * g * hNext;
        gpes.push(gpe);
        kes.push(ke);
        diss.push(energyDissipated);
        vs.push(Math.abs(vNext));
        hs.push(hNext);

        t += dt;
        v = vNext;
        h = hNext;
        if (t > 3600) break;
      }
      return { tEnd: t, vEnd: v, keMax, vMax, eDiss: energyDissipated, series: { t: ts, gpe: gpes, ke: kes, ediss: diss, v: vs, h: hs }, endLabel: 'ground' };
    }
  }

  function initialGPE(m, h0, gravityModel){
    if (gravityModel === 'simplified') return m * 10.0 * h0;
    // Approximate with average g between h0 and 0 using g(h) formula integrated numerically (coarse)
    const steps = 200;
    let sum = 0, dh = h0/steps;
    for (let i=0;i<steps;i++){
      const h = (i+0.5)*dh;
      sum += gAt(h, 'real');
    }
    const gAvg = sum/steps;
    return m * gAvg * h0;
  }

  // Simple chart renderer (no external libs)
  function drawChartEnergy(canvas, series, compareSeries){
    const ctx = canvas.getContext('2d');
    const { t, gpe, ke, ediss } = series;
    const w = canvas.width, h = canvas.height;

    // Compute ranges
    const tMax = t[t.length-1] || 1;
    const eMax = Math.max(
      1,
      ...gpe,
      ...ke,
      ...ediss,
      ...(compareSeries ? compareSeries.gpe : [0]),
      ...(compareSeries ? compareSeries.ke : [0]),
      ...(compareSeries ? compareSeries.ediss : [0])
    );

    // Padding
    const pad = { l:60, r:15, t:15, b:40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;

    ctx.clearRect(0,0,w,h);

    // Background grid
    ctx.fillStyle = '#0b1224';
    ctx.fillRect(0,0,w,h);

    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i=0;i<=6;i++){
      const y = pad.t + (i/6)*plotH;
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w-pad.r, y);
    }
    ctx.stroke();

    // Axes labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('time (s)', pad.l + plotW/2, h-12);

    ctx.save();
    ctx.translate(12, pad.t + plotH/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('energy (J)', 0, 0);
    ctx.restore();

    // Helpers
    const xOf = (ti)=> pad.l + (ti/tMax)*plotW;
    const yOf = (ei)=> pad.t + (1 - ei/eMax)*plotH;

    function line(arr, color, dash=false){
      if (dash){ ctx.setLineDash([6,4]); } else { ctx.setLineDash([]); }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      for (let i=0;i<arr.length;i++){
        const x = xOf(t[i]); const y = yOf(arr[i]);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    line(gpe, '#38bdf8'); // GPE sky
    line(ke, '#22c55e'); // KE green
    line(ediss, '#f59e0b'); // dissipated amber

    if (compareSeries){
      const t2 = compareSeries.t;
      const xOf2 = (ti)=> pad.l + (ti/t2[t2.length-1])*plotW;
      function line2(arr, color){
        ctx.setLineDash([6,4]);
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        for (let i=0;i<arr.length;i++){
          const x = xOf2(t2[i]); const y = yOf(arr[i]);
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      line2(compareSeries.gpe, '#38bdf8');
      line2(compareSeries.ke, '#22c55e');
      line2(compareSeries.ediss, '#f59e0b');
    }

    // Y-axis ticks
    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'right';
    for (let i=0;i<=6;i++){
      const e = (i/6)*eMax;
      const y = yOf(e);
      ctx.fillText(formatEng(e), pad.l - 8, y+4);
    }
  }

  function drawChartVelocity(canvas, series, compareSeries){
    const ctx = canvas.getContext('2d');
    const { t, v } = series;
    const w = canvas.width, h = canvas.height;
    const tMax = t[t.length-1] || 1;
    const vmax = Math.max(1, ...v, ...(compareSeries ? compareSeries.v : [0]));
    const pad = { l:60, r:15, t:15, b:40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const xOf = (ti)=> pad.l + (ti/tMax)*plotW;
    const yOf = (vi)=> pad.t + (1 - vi/vmax)*plotH;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0b1224'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth=1; ctx.beginPath();
    for (let i=0;i<=5;i++){ const y=pad.t + (i/5)*plotH; ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y);} ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText('time (s)', pad.l+plotW/2, h-12);
    ctx.save(); ctx.translate(12, pad.t+plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('speed (m/s)',0,0); ctx.restore();
    function line(arr, color, dash=false){ if(dash){ctx.setLineDash([6,4]);}else{ctx.setLineDash([]);} ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath(); for(let i=0;i<arr.length;i++){ const x=xOf(t[i]); const y=yOf(arr[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]); }
    line(v, '#22c55e');
    if (compareSeries){ const t2=compareSeries.t; const xOf2=(ti)=> pad.l + (ti/t2[t2.length-1])*plotW; ctx.setLineDash([6,4]); ctx.strokeStyle='#22c55e'; ctx.lineWidth=2; ctx.beginPath(); for(let i=0;i<compareSeries.v.length;i++){ const x=xOf2(t2[i]); const y=yOf(compareSeries.v[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]);}    
    ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; for(let i=0;i<=5;i++){ const vi=(i/5)*vmax; const y=yOf(vi); ctx.fillText(vi.toFixed(0), pad.l-8, y+4);}  
  }

  function drawChartAltitude(canvas, series, compareSeries){
    const ctx = canvas.getContext('2d');
    const { t, h:hs } = series;
    const w = canvas.width, h = canvas.height;
    const tMax = t[t.length-1] || 1;
    const hmax = Math.max(1, ...hs, ...(compareSeries ? compareSeries.h : [0]));
    const pad = { l:60, r:15, t:15, b:40 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const xOf = (ti)=> pad.l + (ti/tMax)*plotW;
    const yOf = (hi)=> pad.t + (1 - hi/hmax)*plotH;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0b1224'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth=1; ctx.beginPath();
    for (let i=0;i<=5;i++){ const yy=pad.t + (i/5)*plotH; ctx.moveTo(pad.l,yy); ctx.lineTo(w-pad.r,yy);} ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.fillText('time (s)', pad.l+plotW/2, h-12);
    ctx.save(); ctx.translate(12, pad.t+plotH/2); ctx.rotate(-Math.PI/2); ctx.fillText('altitude (m)',0,0); ctx.restore();
    function line(arr, color, dash=false){ if(dash){ctx.setLineDash([6,4]);}else{ctx.setLineDash([]);} ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath(); for(let i=0;i<arr.length;i++){ const x=xOf(t[i]); const y=yOf(arr[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]); }
    line(hs, '#38bdf8');
    if (compareSeries){ const t2=compareSeries.t; const xOf2=(ti)=> pad.l + (ti/t2[t2.length-1])*plotW; ctx.setLineDash([6,4]); ctx.strokeStyle='#38bdf8'; ctx.lineWidth=2; ctx.beginPath(); for(let i=0;i<compareSeries.h.length;i++){ const x=xOf2(t2[i]); const y=yOf(compareSeries.h[i]); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.setLineDash([]);}    
    ctx.fillStyle='#9ca3af'; ctx.textAlign='right'; for(let i=0;i<=5;i++){ const hi=(i/5)*hmax; const y=yOf(hi); ctx.fillText(formatEng(hi), pad.l-8, y+4);}  
  }

  function formatEng(x){
    if (x===0) return '0';
    const abs = Math.abs(x);
    if (abs >= 1e9) return (x/1e9).toFixed(2)+'e9';
    if (abs >= 1e6) return (x/1e6).toFixed(2)+'e6';
    if (abs >= 1e3) return (x/1e3).toFixed(2)+'e3';
    return x.toFixed(0);
  }

  function updateLegend(mode){
    const legend = $('legend');
    legend.innerHTML = '';
    const items = [
      {c:'#38bdf8', t:'GPE'},
      {c:'#22c55e', t:'KE'},
      {c:'#f59e0b', t:'Energy dissipated (drag)'}
    ];
    for (const it of items){
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<span class="swatch" style="background:${it.c}"></span>${it.t}`;
      legend.appendChild(div);
    }
    if (mode === 'compare'){
      const comp = document.createElement('div');
      comp.className = 'item';
      comp.innerHTML = `<span class="swatch" style="background:linear-gradient(90deg, rgba(255,255,255,.0) 0 40%, currentColor 40% 70%, rgba(255,255,255,.0) 70% 100%); color:#9ca3af; border:1px dashed #9ca3af"></span> Dashed = no drag`;
      legend.appendChild(comp);
    }
  }

  function run(){
    const m = parseFloat($('mass').value);
    const scenario = getScenario();
    const h0Input = parseFloat($('h0').value);
    const h0 = scenario === 'catapult' ? 0 : h0Input;
    const dt = parseFloat($('dt').value);
  const withDrag = $('withDrag').checked;
  const gravityModel = $('gravityModel').value;
    const mode = $('mode').value;
    const springK = parseFloat($('springK')?.value || '0');
    const springX = parseFloat($('springX')?.value || '0');
    const launchAngleDeg = parseFloat($('launchAngle')?.value || '45');

    const Cd = parseFloat($('Cd').value);
    const A = parseFloat($('area').value);
    const rho0 = parseFloat($('rho0').value);
    const H = parseFloat($('scaleH').value);

  const params = { m, h0, dt, withDrag, gravityModel, Cd, A, rho0, H, scenario, springK, springX, launchAngleDeg };
    const res = simulate(params);
    let resNoDrag = null;
    if (mode === 'compare'){
      resNoDrag = simulate({ m, h0, dt, withDrag:false, gravityModel, Cd, A, rho0, H, scenario, springK, springX, launchAngleDeg });
    }

    const gpe0 = initialGPE(m, h0, gravityModel);
    $('gpe0').textContent = fmt(gpe0, 'J');
    // EPE metric
    const epe = scenario === 'catapult' ? 0.5 * springK * springX * springX : 0;
    const epeEl = $('epe'); if (epeEl) epeEl.textContent = scenario === 'catapult' ? fmt(epe, 'J') : '—';
    const v0El = $('v0');
    if (v0El){
      if (scenario === 'catapult' && epe > 0 && m > 0){
        const v0 = Math.sqrt(2*epe/m);
        v0El.textContent = fmt(v0, 'm/s');
      } else {
        v0El.textContent = '—';
      }
    }
    $('keMax').textContent = fmt(res.keMax, 'J');
    $('eDiss').textContent = withDrag ? fmt(res.eDiss, 'J') : '0 J (no drag)';
    $('vMax').textContent = fmt(res.vMax, 'm/s');
    $('tEnd').textContent = fmt(res.tEnd, 's');
    $('vEnd').textContent = fmt(Math.abs(res.vEnd), 'm/s');

    // Active chart
    const activeTab = document.querySelector('.tab.active')?.dataset.chart || 'energy';
    if (activeTab === 'energy'){
      drawChartEnergy($('chartEnergy'), res.series, resNoDrag ? resNoDrag.series : null);
    } else if (activeTab === 'velocity'){
      drawChartVelocity($('chartVelocity'), res.series, resNoDrag ? resNoDrag.series : null);
    } else {
      drawChartAltitude($('chartAltitude'), res.series, resNoDrag ? resNoDrag.series : null);
    }

    updateLegend(mode);
    // Drive astronaut animation from primary series
    animateAstronaut(res.series);
  }

  function reset(){
    $('mass').value = 118;
    $('h0').value = 39045;
    $('dt').value = 0.05;
    $('withDrag').checked = false;
    $('gravityModel').value = 'simplified';
    $('Cd').value = 1.0;
    $('area').value = 0.8;
    $('rho0').value = 1.225;
    $('scaleH').value = 8500;
    $('mode').value = 'single';
    $('preset').value = 'custom';
    // default scenario to freefall and UI state
    if (typeof setScenarioUI === 'function') setScenarioUI('freefall');
    run();
  }

  // Wire up
  $('runBtn').addEventListener('click', run);
  $('resetBtn').addEventListener('click', reset);
  // Scenario buttons
  const btnFreefall = document.getElementById('btnFreefall');
  const btnCatapult = document.getElementById('btnCatapult');
  function setScenarioUI(s){
    if (btnFreefall && btnCatapult){
      btnFreefall.classList.toggle('active', s==='freefall');
      btnCatapult.classList.toggle('active', s==='catapult');
    }
    const panel = document.getElementById('catapultPanel'); if (panel) panel.hidden = (s!=='catapult');
    const h0Row = document.getElementById('h0Row'); if (h0Row) h0Row.classList.toggle('hidden', s==='catapult');
  }
  if (btnFreefall) btnFreefall.addEventListener('click', ()=>{ setScenarioUI('freefall'); run(); });
  if (btnCatapult) btnCatapult.addEventListener('click', ()=>{ setScenarioUI('catapult'); run(); });
  // Launch angle slider label
  const angleSlider = document.getElementById('launchAngle');
  const angleLabel = document.getElementById('launchAngleLabel');
  if (angleSlider && angleLabel){
    angleSlider.addEventListener('input', ()=>{ angleLabel.textContent = angleSlider.value; });
    angleLabel.textContent = angleSlider.value;
  }
  // Presets
  $('preset').addEventListener('change', () => {
    const p = $('preset').value;
    if (p === 'tucked'){ $('Cd').value = 0.9; $('area').value = 0.7; }
    else if (p === 'spread'){ $('Cd').value = 1.2; $('area').value = 1.0; }
    else if (p === 'headfirst'){ $('Cd').value = 0.7; $('area').value = 0.6; }
  });
  // Tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const which = btn.dataset.chart;
      $('chartEnergy').hidden = which !== 'energy';
      $('chartVelocity').hidden = which !== 'velocity';
      $('chartAltitude').hidden = which !== 'altitude';
      run(); // rerender selected chart
    });
  });
  updateLegend('single');
  // First run
  run();

  // Catapult launch button triggers run()
  const launchBtn = document.getElementById('launchBtn');
  if (launchBtn){
    launchBtn.addEventListener('click', () => {
      setScenarioUI('catapult');
      run();
      const svgEl = document.getElementById('astroSVG');
      if (svgEl && svgEl.scrollIntoView) svgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Astronaut animation driver: map altitude to SVG Y position
  function animateAstronaut(series){
    const g = document.getElementById('astronaut');
    const svg = document.getElementById('astroSVG');
    const velLine = document.getElementById('velLine');
    const velText = document.getElementById('velText');
    const spring = document.getElementById('spring');
    const traj = document.getElementById('trajPath');
    if (!g || !svg || !series) return;
    const hs = series.h; const ts = series.t; const vs = series.v; const xs = series.x || [];
    if (!hs.length) return;
    const h0 = hs[0];
    const hMax = Math.max(...hs, 1);
    const yTop = 20; // initial astronaut y in SVG coords
    const yGround = 250; // near ground line
    // Playback over ~6 seconds regardless of full sim duration
    const playback = 6000;
    const tTotal = ts[ts.length-1] || 1;
    const tStart = performance.now();
    const isCatapult = (document.getElementById('btnCatapult')?.classList.contains('active'));
    // Build/clear trajectory path for catapult
    if (traj){
      if (isCatapult && xs.length === hs.length){
        const xMax = Math.max(1, ...xs);
        const yMax = Math.max(1, ...hs);
        // Map sim x to ~120px span, y to 0..(yGround-yTop)
        const xScale = 120 / xMax;
        const yScale = (yGround - yTop) / yMax;
        let d = '';
        for (let i=0;i<xs.length;i++){
          const px = 200 + xs[i] * xScale; // origin near astronaut start
          const py = yGround - hs[i]*yScale;
          d += (i===0?`M${px.toFixed(1)},${py.toFixed(1)}`:` L${px.toFixed(1)},${py.toFixed(1)}`);
        }
        traj.setAttribute('d', d);
        traj.setAttribute('opacity', '0.6');
      } else {
        traj.setAttribute('d', '');
        traj.setAttribute('opacity', '0');
      }
    }
    function step(now){
      const u = Math.min(1, (now - tStart)/playback);
      const simT = u * tTotal;
      // find nearest index
      let i = 0; while (i < ts.length-1 && ts[i+1] < simT) i++;
      // Normalize altitude mapping; if h0 is 0 (catapult), use max altitude reached
      const denom = (h0 > 0 ? h0 : hMax);
      const y = yTop + (yGround - yTop) * (1 - (hs[i]/denom));
      // slight horizontal drift for catapult and tilt at start
      let x = 200;
      let rot = 0;
      if (isCatapult){
        const early = Math.min(1, simT / 1.0); // first 1s
        x = 200 + 40 * early; // small rightward motion
        const chosen = parseFloat(document.getElementById('launchAngle')?.value || '45');
        rot = chosen * (1 - early); // start at chosen angle, level out to 0° within 1s
      }
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(1)})`);
      // Update velocity arrow: map speed (m/s) to pixels
      if (velLine && velText){
        const vms = vs[i] || 0;
        const pxPerMs = 0.15; // scale: 1 m/s = 0.15 px
        const len = Math.min(120, Math.max(8, vms * pxPerMs));
        velLine.setAttribute('y2', (len).toFixed(1));
        velText.textContent = `${vms.toFixed(0)} m/s`;
      }
      // Spring visual for catapult: quick decompress then hide
      if (spring){
        if (isCatapult && u < 0.18){
          const phase = u / 0.18; // 0..1 over intro window
          const scaleY = 1.6 - 0.6 * phase; // from compressed (1.6x) to normal (1.0x)
          spring.setAttribute('transform', `translate(0,-30) scale(1,${scaleY.toFixed(2)})`);
          spring.style.opacity = '1';
        } else {
          spring.style.opacity = '0';
        }
      }
      if (u < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // (animation is triggered inside run())
})();
