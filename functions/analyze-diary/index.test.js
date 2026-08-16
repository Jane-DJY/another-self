'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAndNormalize, normalizeReview } = require('./index.js');

const base = {
  title: '正在重建坐标', periods: ['前段', '中段', '近期'],
  themes: [
    { key: 'work', label: '工作', color: '#663377', shares: [8, 3, 9] },
    { key: 'create', label: '创作', color: '#ff6633', shares: [1, 5, 0] },
    { key: 'care', label: '照护', color: '#ffcc33', shares: [1, 2, 1] }
  ],
  milestones: [{ periodIndex: 99, themeKey: 'missing', label: '节点', evidence: '匿名证据', meaning: '有限解释' }],
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
  assert.equal(result.milestones[0].periodIndex, 2);
  assert.equal(result.milestones[0].themeKey, 'work');
  assert.deepEqual(result.futurePaths[0].themeChanges, { create: 12 });
  assert.equal(result.roleModels.length, 1);
});

test('normalizes a local review without changing unrelated report data', () => {
  const reviewed = normalizeReview('insight', { type: 'tension', title: '新的理解', body: '只修改这一条', evidenceRefs: ['用户补充'] }, { periods: base.periods, themes: base.themes });
  assert.deepEqual(reviewed, { type: 'tension', title: '新的理解', body: '只修改这一条', evidenceRefs: ['用户补充'] });
});
