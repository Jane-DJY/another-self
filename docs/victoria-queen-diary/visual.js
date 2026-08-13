const SVG_NS = 'http://www.w3.org/2000/svg';

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
  const scale = mini ? .72 : 1;
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
  const center = mini ? 260 : 345;
  const top = mini ? 42 : 24;
  const colors = ['#5A3D82','#CE5A8F','#A56BD3','#E6A640','#D979B5','#6D9F91'];
  const rowCounts = [3, 5, 6, 6, 5, 3];
  const labelSlots = mini ? {} : {
    '2-0': '日常', '2-2': '阅读', '2-4': '亲情',
    '3-1': '艺术', '3-3': '出行', '3-5': '社交'
  };
  let colorIndex = 0;
  rowCounts.forEach((count, row) => {
    const w = mini ? 64 : 76;
    const h = mini ? 24 : 30;
    const stepX = mini ? 48 : 57;
    const stepY = mini ? 27 : 32;
    const rowWidth = (count - 1) * stepX + w;
    for (let col = 0; col < count; col++) {
      const jitterX = Math.sin((row + 1) * 7 + col * 2.1) * (mini ? 5 : 7);
      const jitterY = Math.cos(row * 3.2 + col * 1.7) * (mini ? 2 : 3);
      const x = center - rowWidth / 2 + col * stepX + jitterX;
      const y = top + row * stepY + jitterY;
      const rotation = ((row * 3 + col) % 5 - 2) * 2.6;
      const label = labelSlots[`${row}-${col}`];
      const group = el('g', { transform: `rotate(${rotation} ${x+w/2} ${y+h/2})` });
      group.appendChild(el('rect', { x, y, width: w, height: h, rx: 5, fill: colors[colorIndex % colors.length], opacity: label ? .96 : .82 }));
      if (label) {
        group.appendChild(el('text', {
          x: x + w / 2,
          y: y + h / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: 'white',
          'font-size': 14,
          'font-weight': 800
        }, label));
      }
      svg.appendChild(group);
      colorIndex += 1;
    }
  });
}

function renderRiver(svg, data, mini = false) {
  const center = mini ? 260 : 345;
  const yTop = mini ? 245 : 245;
  const yBottom = mini ? 720 : 1030;
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

  const yearAxisX = 610;
  svg.appendChild(el('line', { x1: yearAxisX, y1: yTop, x2: yearAxisX, y2: yBottom, stroke: '#c9b5c8', 'stroke-width': 1, opacity: .72 }));
  rows.forEach((row, ri) => {
    const t = ri / (rows.length - 1);
    const y = yTop + t * (yBottom-yTop);
    const g = el('g', { class: `year-hit${ri === 0 ? ' active' : ''}`, 'data-year': row.year });
    const bodyRight = center + bodyHalfWidth(t, false);
    g.appendChild(el('line', { x1: bodyRight + 8, y1: y, x2: yearAxisX, y2: y, stroke: '#c9b5c8', 'stroke-width': 1 }));
    g.appendChild(el('circle', { cx: yearAxisX, cy: y, r: 6, fill: '#9e759a' }));
    g.appendChild(el('text', { x: yearAxisX + 16, y: y + 5, class: 'year-label' }, `${row.year} · ${row.age}岁`));
    g.addEventListener('click', () => selectYear(row.year, data));
    svg.appendChild(g);
  });

  const milestoneCategories = {
    1832: 'dailyRhythm',
    1836: 'familyAffection',
    1837: 'publicDuty',
    1838: 'publicDuty'
  };
  data.milestones.forEach((m) => {
    const ri = rows.findIndex(r => r.year === m.year);
    if (ri < 0) return;
    const categoryIndex = categories.findIndex(category => category.key === milestoneCategories[m.year]);
    if (categoryIndex < 0) return;
    const y = yTop + ri / (rows.length - 1) * (yBottom-yTop);
    const leftX = boundaries[categoryIndex][ri][0];
    const rightX = boundaries[categoryIndex + 1][ri][0];
    const x = (leftX + rightX) / 2;
    const label = el('text', { x, y: y - 8, 'text-anchor': 'middle', class: 'milestone-label milestone-label-inside' });
    const lines = m.year === 1832 ? ['13岁', '开始日记'] : [m.label];
    lines.forEach((line, index) => label.appendChild(el('tspan', { x, dy: index === 0 ? 0 : 11 }, line)));
    svg.appendChild(el('circle', { cx: x, cy: y + 7, r: 3.5, fill: '#fff', opacity: .96 }));
    svg.appendChild(label);
  });

  svg.appendChild(el('text', { x: center, y: 1067, 'text-anchor': 'middle', fill: '#8c778d', 'font-size': 10 }, '公开日记选编中的主题词数份额 · 同年横截面=100%'));
  svg.appendChild(el('text', { x: center, y: 650, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.20)', 'font-size': 11, 'font-weight': 700 }, '爱可视化的简女士'));
  svg.appendChild(el('text', { x: 674, y: 1088, 'text-anchor': 'end', fill: 'rgba(56,34,67,.45)', 'font-size': 8 }, 'Jane of Visual Stories'));
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
