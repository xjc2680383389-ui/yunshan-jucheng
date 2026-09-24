// UI 接线：模式三键 / 昼夜控制台 / 性能开关 / 说明面板 / 载入遮罩 / FPS（全中文）
export function initUI(opts) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    loading: $('loading'), loadingBar: $('loadingBar'), loadingPct: $('loadingPct'),
    timeLabel: $('timeLabel'), slider: $('timeSlider'),
    btnPlay: $('btnPlay'), fps: $('fps'), help: $('help'), err: $('err'),
    autotest: $('autotest'),
  };

  const setModeBtns = (m) => {
    for (const b of ['btnOrbit', 'btnWalk', 'btnTour']) $(b).classList.toggle('on', b === 'btn' + m[0].toUpperCase() + m.slice(1));
  };
  // 模式三键
  $('btnOrbit').onclick = () => { opts.onMode('orbit'); setModeBtns('orbit'); };
  $('btnWalk').onclick = () => {
    if ($('btnWalk').disabled) return;
    opts.onMode('walk'); setModeBtns('walk');
  };
  $('btnTour').onclick = () => { opts.onMode('tour'); setModeBtns('tour'); };
  // 性能模式
  let perf = false;
  $('btnPerf').onclick = () => {
    perf = !perf;
    $('btnPerf').classList.toggle('on', perf);
    opts.onPerf(perf);
  };
  // 说明面板
  $('btnHelp').onclick = () => { ui.help.classList.add('show'); };
  $('btnHelpClose').onclick = () => { ui.help.classList.remove('show'); };
  // 昼夜控制台
  ui.btnPlay.onclick = () => { opts.onPlay(); };
  for (const [id, v] of [['sp60', 60], ['sp360', 360], ['sp1440', 1440]]) {
    $(id).onclick = () => {
      for (const x of ['sp60', 'sp360', 'sp1440']) $(x).classList.toggle('on', x === id);
      opts.onSpeed(v);
    };
  }
  ui.slider.addEventListener('input', () => opts.onScrub(parseFloat(ui.slider.value)));
  // 移动端：漫游禁用
  if (window.innerWidth <= 768) $('btnWalk').disabled = true;

  return {
    slider: ui.slider,
    setProgress(f) {
      ui.loadingBar.style.width = Math.round(f * 100) + '%';
      ui.loadingPct.textContent = '正在生成世界 … ' + Math.round(f * 100) + '%';
    },
    hideLoading() { ui.loading.style.display = 'none'; },
    setTime(t) {
      const hh = Math.floor(t) % 24, mm = Math.floor((t % 1) * 60);
      ui.timeLabel.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      if (!opts.isScrubbing()) ui.slider.value = t;
    },
    setPlay(paused) { ui.btnPlay.textContent = paused ? '▶' : '⏸'; },
    setFPS(v) { ui.fps.textContent = v.toFixed(0) + ' FPS'; },
    showError(msg) { ui.err.textContent = '出错了：' + msg; ui.err.style.display = 'block'; },
  };
}
