'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAndNormalize, normalizeReview, resolvePaletteColors, cleanLetterStyle } = require('./index.js');

const base = {
  title: '正在重建坐标', periods: ['前段', '中段', '近期'],
  periodVolumes: [120, 40, 260],
  themes: [
    { key: 'work', label: '工作', color: '#663377', volumes: [96, 12, 234] },
    { key: 'create', label: '创作', color: '#ff6633', volumes: [12, 20, 0] },
    { key: 'care', label: '照护', color: '#ffcc33', volumes: [12, 8, 26] }
  ],
  milestones: [{ periodIndex: 99, themeKey: 'missing', label: '节点', quote: '今天第一次把作品公开发了出去。', evidence: '匿名证据', meaning: '从私下练习变成公开表达。' }],
  insights: [{ type: 'growing', title: '创作变多', body: '在本次记录中出现得更频繁', evidenceRefs: ['近期多次提到'] }],
  futurePaths: [{ key: 'maker', title: '持续创作', premise: '如果继续每周投入', conditions: ['保留时间'], gain: '获得作品', cost: '减少休息', themeChanges: { create: 12, bad: 99 }, nextAction: '完成一次小发布' }],
  roleModels: [
    { pathKey: 'maker', name: '公开人物', identity: '创作者', reason: '路径可参考', sourceTitle: '资料', sourceUrl: 'https://example.com/source' },
    { pathKey: 'maker', name: '无来源人物', reason: '不应保留', sourceUrl: 'javascript:alert(1)' }
  ]
};

test('normalizes shares, evidence, coverage, future paths and verified links', () => {
  const result = validateAndNormalize(base, { fileCount: 2, characterCount: 2400 });
  result.periods.forEach((_, index) => assert.ok(Math.abs(result.themes.reduce((sum, theme) => sum + theme.shares[index], 0) - 100) < 0.02));
  assert.equal(result.coverage.fileCount, 2);
  assert.deepEqual(result.periodVolumes, [120, 40, 260]);
  result.periods.forEach((_, index) => assert.ok(Math.abs(result.themes.reduce((sum, theme) => sum + theme.volumes[index], 0) - result.periodVolumes[index]) < 0.02));
  assert.equal(result.milestones[0].periodIndex, 2);
  assert.equal(result.milestones[0].themeKey, 'work');
  assert.equal(result.milestones[0].quote, '今天第一次把作品公开发了出去。');
  assert.deepEqual(result.futurePaths[0].themeChanges, { create: 12 });
  assert.equal(result.roleModels.length, 1);
  assert.equal(result.roleModels[0].name, 'Nadieh Bremer');
  assert.equal(result.roleModels[0].sourceUrl, 'https://www.visualcinnamon.com/about');
  assert.match(result.roleModels[0].libraryUrl, /women-stars/);
  assert.ok(result.roleModels[0].photo);
  assert.ok(result.roleModels[0].voiceTraits);
});

test('normalizes a local review without changing unrelated report data', () => {
  const reviewed = normalizeReview('insight', { type: 'tension', title: '新的理解', body: '只修改这一条', evidenceRefs: ['用户补充'] }, { periods: base.periods, themes: base.themes });
  assert.deepEqual(reviewed, { type: 'tension', title: '新的理解', body: '只修改这一条', evidenceRefs: ['用户补充'] });
});

test('uses distinct preset colors and accepts only valid custom photo colors', () => {
  assert.equal(new Set(resolvePaletteColors('电光花园')).size, 7);
  assert.deepEqual(resolvePaletteColors('照片取色', ['#ff0000','#00ff00','#0000ff','#ffee00','bad']), ['#FF0000','#00FF00','#0000FF','#FFEE00']);
  assert.deepEqual(resolvePaletteColors('照片取色', ['#ff0000']), resolvePaletteColors('电光花园'));
});

test('removes contrast-template phrasing from generated letters', () => {
  const cleaned = cleanLetterStyle('这不是一次退后，而是一次停顿。并非你不够努力，而是清单太满。不是卡住，是先放一放。与其说这是失败，不如说先睡一觉。');
  assert.doesNotMatch(cleaned, /不是|并非|而是|与其说|不如说/);
  assert.match(cleaned, /一次停顿/);
  assert.match(cleaned, /清单太满/);
  assert.match(cleaned, /先放一放/);
  assert.match(cleaned, /先睡一觉/);
});
