const SVG_NS = 'http://www.w3.org/2000/svg';

if (new URLSearchParams(location.search).get('preview') === '1') {
  document.body.classList.add('preview-mode');
}

const el = (name, attrs = {}, text = '') => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
};

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function bandPath(left, right) {
  return `${smoothPath(left)} L ${right[right.length - 1][0]} ${right[right.length - 1][1]} ${smoothPath([...right].reverse()).replace(/^M [^C]+/, '')} Z`;
}

function bodyHalfWidth(t, mini = false) {
  const scale = mini ? .72 : 1.24;
  const points = [
    [0, 70], [.08, 56], [.17, 94], [.28, 190], [.42, 225],
    [.57, 168], [.7, 156], [.82, 178], [1, 205]
  ];
  let width = points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [ta, wa] = points[i], [tb, wb] = points[i + 1];
    if (t >= ta && t <= tb) {
      const u = (t - ta) / (tb - ta);
      width = wa + (wb - wa) * (u * u * (3 - 2 * u));
      break;
    }
  }
  return width * scale;
}

function renderHead(svg, mini = false) {
  const center = mini ? 260 : 320;
  const top = mini ? 28 : 18;
  const colors = ['#5A3D82','#CE5A8F','#A56BD3','#E6A640','#D979B5','#6D9F91'];
  const rowCounts = mini ? [3, 5, 6, 7, 7, 7, 6, 5, 3] : [2, 4, 5, 6, 7, 6, 5, 4, 2];
  const backgroundBlocks = [];
  let colorIndex = 0;
  rowCounts.forEach((count, row) => {
    const baseW = mini ? 43 : 68;
    const h = mini ? 18 : 28;
    const stepX = mini ? 31 : 50;
    const stepY = mini ? 20 : 28.5;
    const rowWidth = (count - 1) * stepX + baseW;
    for (let col = 0; col < count; col++) {
      const w = baseW + Math.sin(row * 4.7 + col * 2.3) * (mini ? 4 : 7);
      const jitterX = Math.sin((row + 1) * 5.3 + col * 2.7) * (mini ? 5 : 8);
      const jitterY = Math.cos(row * 2.8 + col * 1.9) * (mini ? 2 : 3);
      const x = center - rowWidth / 2 + col * stepX + jitterX - (w - baseW) / 2;
      const y = top + row * stepY + jitterY;
      const rotation = Math.sin(row * 2.1 + col * 3.4) * 8;
      const group = el('g', { transform: `rotate(${rotation} ${x+w/2} ${y+h/2})` });
      group.appendChild(el('rect', { x, y, width: w, height: h, rx: 5, fill: colors[colorIndex % colors.length], opacity: .8 }));
      backgroundBlocks.push(group);
      colorIndex += 1;
    }
  });
  backgroundBlocks.forEach(group => svg.appendChild(group));

  if (!mini) {
    const labelBlocks = [
      { label: '日常', x: center - 165, y: 110, w: 104, color: '#5A3D82', rotation: -4 },
      { label: '阅读', x: center - 52, y: 102, w: 104, color: '#CE5A8F', rotation: 3 },
      { label: '亲情', x: center + 62, y: 111, w: 106, color: '#A56BD3', rotation: -2 },
      { label: '艺术', x: center - 150, y: 169, w: 104, color: '#E6A640', rotation: 4 },
      { label: '出行', x: center - 30, y: 160, w: 106, color: '#6D9F91', rotation: -3 },
      { label: '社交', x: center + 90, y: 171, w: 104, color: '#D979B5', rotation: 3 }
    ];
    labelBlocks.forEach(item => {
      const h = 38;
      const group = el('g', { transform: `rotate(${item.rotation} ${item.x + item.w/2} ${item.y + h/2})` });
      group.appendChild(el('rect', { x: item.x, y: item.y, width: item.w, height: h, rx: 5, fill: item.color, opacity: .98 }));
      group.appendChild(el('text', {
        x: item.x + item.w / 2,
        y: item.y + h / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: 'white',
        'font-size': 20,
        'font-weight': 800
      }, item.label));
      svg.appendChild(group);
    });
    svg.appendChild(el('path', {
      d: `M ${center - 12} 286 Q ${center} 295 ${center + 12} 286 M ${center - 8} 288 Q ${center} 293 ${center + 8} 288`,
      fill: 'none',
      stroke: '#c96f7d',
      'stroke-width': 2.6,
      'stroke-linecap': 'round',
      opacity: .95,
      'aria-hidden': 'true'
    }));
  }
}

function renderRiver(svg, data, mini = false) {
  const center = mini ? 260 : 320;
  const yTop = mini ? 245 : 302;
  const yBottom = mini ? 720 : 1062;
  const rows = data.yearly;
  const categories = data.categories;
  const boundaries = Array.from({ length: categories.length + 1 }, () => []);

  rows.forEach((row, ri) => {
    const t = ri / (rows.length - 1);
    const y = yTop + t * (yBottom - yTop);
    const totalWidth = bodyHalfWidth(t, mini) * 2;
    let x = center - totalWidth / 2;
    boundaries[0].push([x, y]);
    categories.forEach((category, ci) => {
      x += totalWidth * row.shares[category.key] / 100;
      boundaries[ci + 1].push([x, y]);
    });
  });

  categories.forEach((category, i) => {
    const path = el('path', {
      d: bandPath(boundaries[i], boundaries[i + 1]),
      fill: category.color,
      opacity: .96,
      class: 'river-band growing',
      'data-key': category.key,
      style: `--delay:${i * .08}s`
    });
    svg.appendChild(path);
    if (!mini) path.addEventListener('click', () => selectCategory(category.key, data));
  });

  if (mini) return;

  const yearAxisX = 648;
  svg.appendChild(el('line', { x1: yearAxisX, y1: yTop, x2: yearAxisX, y2: yBottom, stroke: '#c9b5c8', 'stroke-width': 1, opacity: .72 }));
  rows.forEach((row, ri) => {
    const t = ri / (rows.length - 1);
    const y = yTop + t * (yBottom-yTop);
    const g = el('g', { class: `year-hit${ri === 0 ? ' active' : ''}`, 'data-year': row.year });
    g.appendChild(el('circle', { cx: yearAxisX, cy: y, r: 6, fill: '#9e759a' }));
    g.appendChild(el('text', { x: yearAxisX + 16, y: y + 5, class: 'year-label' }, `${row.year} · ${row.age}岁`));
    g.addEventListener('click', () => selectYear(row.year, data));
    svg.appendChild(g);
  });

  data.milestones.forEach((m) => {
    const at = Math.max(0, Math.min(rows.length - 1, Number(m.at)));
    const lower = Math.floor(at);
    const upper = Math.ceil(at);
    const mix = at - lower;
    const categoryIndex = categories.findIndex(category => category.key === m.category);
    if (categoryIndex < 0) return;
    const y = yTop + at / (rows.length - 1) * (yBottom-yTop);
    const interpolateX = (boundaryIndex) => {
      const from = boundaries[boundaryIndex][lower][0];
      const to = boundaries[boundaryIndex][upper][0];
      return from + (to - from) * mix;
    };
    const leftX = interpolateX(categoryIndex);
    const rightX = interpolateX(categoryIndex + 1);
    const x = (leftX + rightX) / 2;
    const lines = m.lines || [m.label];
    const labelY = y - 10 - (lines.length - 1) * 17;
    const label = el('text', { x, y: labelY, 'text-anchor': 'middle', class: 'milestone-label milestone-label-inside' });
    lines.forEach((line, index) => label.appendChild(el('tspan', { x, dy: index === 0 ? 0 : 17 }, line)));
    svg.appendChild(el('circle', { cx: x, cy: y, r: 4, fill: '#fff', opacity: .96 }));
    svg.appendChild(label);
  });

}

function renderLegend(data) {
  const legend = document.getElementById('legend');
  if (!legend) return;
  data.categories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<span class="swatch" style="background:${category.color}"></span>${category.zh}<small>${data.totalShares[category.key].toFixed(1)}%</small>`;
    button.addEventListener('click', () => selectCategory(category.key, data));
    legend.appendChild(button);
  });
}

function selectCategory(key, data) {
  const panel = document.querySelector('.river-panel');
  panel?.classList.add('has-active');
  document.querySelectorAll('.river-band').forEach(p => p.classList.toggle('active', p.dataset.key === key));
  const category = data.categories.find(c => c.key === key);
  const min = data.yearly.reduce((a,b) => a.shares[key] < b.shares[key] ? a : b);
  const max = data.yearly.reduce((a,b) => a.shares[key] > b.shares[key] ? a : b);
  const details = document.getElementById('details');
  if (!details) return;
  details.style.borderColor = category.color;
  details.innerHTML = `<p class="detail-kicker">主题河流 · ${category.zh}</p><h2>${category.zh}从${min.year}年的${min.shares[key].toFixed(1)}%，变化到${max.year}年的${max.shares[key].toFixed(1)}%高点。</h2><p>全部选编语料中占${data.totalShares[key].toFixed(1)}%。这是被词典归类的文本词数份额，不等于她实际时间分配。</p>`;
}

function selectYear(year, data) {
  document.querySelector('.river-panel')?.classList.remove('has-active');
  document.querySelectorAll('.river-band').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.year-hit').forEach(g => g.classList.toggle('active', Number(g.dataset.year) === year));
  const row = data.yearly.find(r => r.year === year);
  const top = data.categories.map(c => ({...c, share: row.shares[c.key]})).sort((a,b) => b.share-a.share).slice(0,2);
  const details = document.getElementById('details');
  if (!details) return;
  details.style.borderColor = top[0].color;
  details.innerHTML = `<p class="detail-kicker">${row.year} · ${row.age}岁 · ${row.entries}篇记录</p><h2>${top[0].zh}占${top[0].share.toFixed(1)}%，${top[1].zh}占${top[1].share.toFixed(1)}%。</h2><p>该年解析${row.words.toLocaleString()}个日记词。点击某条河流，可追踪它在1832—1838年之间的变化。</p>`;
}

function replay() {
  document.querySelectorAll('.river-band').forEach((path, i) => {
    path.classList.remove('growing');
    void path.getBoundingClientRect();
    path.style.setProperty('--delay', `${i * .08}s`);
    path.classList.add('growing');
  });
}

fetch('data/analysis.json')
  .then(response => {
    if (!response.ok) throw new Error(`analysis.json ${response.status}`);
    return response.json();
  })
  .then(data => {
    const mini = document.getElementById('miniRiver');
    if (mini) { renderHead(mini, true); renderRiver(mini, data, true); }
    const chart = document.getElementById('riverChart');
    if (chart) { renderHead(chart, false); renderRiver(chart, data, false); renderLegend(data); }
    document.getElementById('replay')?.addEventListener('click', replay);
  })
  .catch(error => {
    console.error(error);
    document.body.dataset.error = error.message;
  });
