'use strict';

const ALLOWED_ORIGINS = new Set([
  'https://jane-djy.github.io',
  'http://localhost:8766',
  'http://127.0.0.1:8766'
]);
const MAX_TEXT_LENGTH = 120000;
const MODEL = process.env.DASHSCOPE_MODEL || 'qwen-plus';
const ENDPOINT = process.env.DASHSCOPE_ENDPOINT ||
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const SYSTEM_PROMPT = `你是“另世我”的生活记录分析器。只根据用户提供的记录提取可核对的模式，不诊断、不预测命运、不补造事实。所有判断都必须写成“在本次记录中”的有限观察。
请输出严格 JSON，且只能输出 JSON。结构如下：
{
  "title":"12字以内的生命阶段标题",
  "subtitle":"30字以内的证据边界说明",
  "periods":["时间段1","时间段2","时间段3","时间段4"],
  "themes":[{"key":"英文短键","label":"中文主题","color":"#六位十六进制色","shares":[25,30,20,25]}],
  "coverage":{"range":"记录覆盖的日期或诚实阶段","summary":"覆盖度说明","gaps":["已知缺口"]},
  "milestones":[{"periodIndex":0,"themeKey":"对应主题key","label":"12字以内","evidence":"匿名化的简短原文或特征","meaning":"这段变化可能意味着什么"}],
  "insights":[{"type":"repeating|growing|compressed|tension","title":"16字以内","body":"80字以内的有限观察","evidenceRefs":["日期或匿名化原句特征"]}],
  "futurePaths":[{"key":"英文短键","title":"条件化路径名称","premise":"如果继续什么投入","conditions":["需要的条件"],"gain":"可能获得什么","cost":"需要付出什么代价","themeChanges":{"主题key":5},"nextAction":"7天内可执行的低风险行动"}],
  "letter":"写给当下自己的150至260字中文信，不做医疗或人生定论",
  "privacyWarnings":["检测到的可能敏感信息类型，不复述原文"]
}
规则：periods 取3至8个真实时间段；themes 取4至7个互斥主题；每个 shares 数组长度必须等于 periods，且同一时间段所有主题份额之和为100；milestones 取3至5个；insights 取3至5条并尽量覆盖四种 type；futurePaths 固定3条，只能写条件化情景；themeChanges 是相对当前最后阶段的百分点变化，可正可负。若记录日期不足，使用“前段/中段/后段”等诚实标签。不得输出用户记录中的真实姓名、公司名、联系方式、地址、健康细节或关系人物身份。不要生成或推荐任何真实人物，人物参照由系统的已核验资料库另行匹配。`;

const REVIEW_PROMPT = `你正在局部修订“另世我”报告。只返回严格 JSON，不要改动用户没有要求修改的模块。根据 module 输出对应结构：theme 返回单个 theme；milestone 返回单个 milestone；insight 返回单个 insight；futurePath 返回单个 futurePath。保留有限表述，不诊断、不预测命运，不复述敏感信息。`;

function cors(origin) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
}

function response(statusCode, origin, payload) {
  return { statusCode, headers: cors(origin), body: JSON.stringify(payload) };
}

function normalizeEvent(event) {
  if (Buffer.isBuffer(event) || event instanceof Uint8Array) {
    const text = Buffer.from(event).toString('utf8');
    try { return JSON.parse(text); } catch { return { body: text }; }
  }
  if (typeof event === 'string') {
    try { return JSON.parse(event); } catch { return { body: event }; }
  }
  return event || {};
}

function safeText(value, max) { return String(value || '').trim().slice(0, max); }
function safeArray(value, max, itemMax = 120) {
  return (Array.isArray(value) ? value : []).slice(0, max).map(item => safeText(item, itemMax)).filter(Boolean);
}
function safeUrl(value) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href.slice(0, 500) : ''; } catch { return ''; }
}

const VERIFIED_ROLE_MODELS = [
  { name: 'Nadieh Bremer', identity: '数据可视化设计师与独立创作者', keywords: /创作|视觉|数据|作品|表达/, reason: '她长期以数据可视化和独立创作为实践，可作为持续小步创作、逐步形成个人方法的公开参照。', sourceTitle: 'Visual Cinnamon · About', sourceUrl: 'https://www.visualcinnamon.com/about' },
  { name: 'Jen Simmons', identity: '网页设计师与 Web 标准倡导者', keywords: /产品|设计|网页|公开|专业/, reason: '她长期公开分享网页设计与标准实践，可作为把专业投入沉淀为公开作品和可复用方法的参照。', sourceTitle: 'Jen Simmons · Official Website', sourceUrl: 'https://jensimmons.com/' },
  { name: '李飞飞', identity: '计算机科学家与人工智能研究者', keywords: /学习|研究|技术|教育|长期/, reason: '她在研究、教育与产业之间长期工作，可作为把持续学习积累转化为长期专业方向的公开参照。', sourceTitle: 'Stanford · Fei-Fei Li', sourceUrl: 'https://cs.stanford.edu/people/feifeili/' }
];

function matchVerifiedRoleModels(futurePaths) {
  const used = new Set();
  return futurePaths.map((path, index) => {
    const text = `${path.title} ${path.premise} ${path.gain} ${(path.conditions || []).join(' ')}`;
    let model = VERIFIED_ROLE_MODELS.find(item => item.keywords.test(text) && !used.has(item.name));
    if (!model) model = VERIFIED_ROLE_MODELS.find(item => !used.has(item.name)) || VERIFIED_ROLE_MODELS[index % VERIFIED_ROLE_MODELS.length];
    used.add(model.name);
    return { pathKey: path.key, name: model.name, identity: model.identity, reason: model.reason, sourceTitle: model.sourceTitle, sourceUrl: model.sourceUrl };
  });
}

function validateAndNormalize(result, metadata = {}) {
  if (!result || !Array.isArray(result.periods) || !Array.isArray(result.themes)) {
    throw new Error('模型返回的数据结构不完整');
  }
  const periods = result.periods.slice(0, 8).map(String);
  if (periods.length < 3) throw new Error('时间段不足');
  const themes = result.themes.slice(0, 7).map((theme, index) => ({
    key: String(theme.key || `theme${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24),
    label: String(theme.label || `主题${index + 1}`).slice(0, 12),
    color: /^#[0-9a-fA-F]{6}$/.test(theme.color) ? theme.color : ['#673779','#d64fae','#f1b943','#447ca8','#5a8770','#c66d50','#8c6bb1'][index],
    shares: periods.map((_, i) => Math.max(0, Number(theme.shares?.[i]) || 0))
  })).filter(theme => theme.key);
  if (themes.length < 3) throw new Error('主题不足');
  periods.forEach((_, periodIndex) => {
    const total = themes.reduce((sum, theme) => sum + theme.shares[periodIndex], 0) || 1;
    themes.forEach(theme => { theme.shares[periodIndex] = Number((theme.shares[periodIndex] * 100 / total).toFixed(2)); });
  });
  const validKeys = new Set(themes.map(theme => theme.key));
  const futurePaths = (Array.isArray(result.futurePaths) ? result.futurePaths : []).slice(0, 3).map((item, index) => {
    const changes = {};
    Object.entries(item.themeChanges || {}).forEach(([key, value]) => {
      if (validKeys.has(key)) changes[key] = Math.max(-50, Math.min(50, Number(value) || 0));
    });
    return {
      key: safeText(item.key || `path${index + 1}`, 24).replace(/[^a-zA-Z0-9_-]/g, '') || `path${index + 1}`,
      title: safeText(item.title || `可能路径${index + 1}`, 36), premise: safeText(item.premise, 180),
      conditions: safeArray(item.conditions, 4, 100), gain: safeText(item.gain, 180), cost: safeText(item.cost, 180),
      themeChanges: changes, nextAction: safeText(item.nextAction, 180)
    };
  });
  return {
    title: String(result.title || '我的另世我').slice(0, 30),
    subtitle: String(result.subtitle || '基于本次提供的生活记录生成').slice(0, 80),
    periods,
    themes,
    coverage: {
      range: safeText(result.coverage?.range || `${periods[0]}—${periods[periods.length - 1]}`, 80),
      fileCount: Math.max(0, Number(metadata.fileCount) || 0),
      characterCount: Math.max(0, Number(metadata.characterCount) || 0),
      summary: safeText(result.coverage?.summary || '仅反映本次提供的记录，不代表完整人生。', 180),
      gaps: safeArray(result.coverage?.gaps, 5, 100)
    },
    milestones: (Array.isArray(result.milestones) ? result.milestones : []).slice(0, 5).map(item => ({
      periodIndex: Math.min(periods.length - 1, Math.max(0, Number(item.periodIndex) || 0)),
      themeKey: validKeys.has(item.themeKey) ? item.themeKey : themes[0].key,
      label: String(item.label || '重要节点').slice(0, 24),
      evidence: String(item.evidence || '').slice(0, 220),
      meaning: safeText(item.meaning, 220)
    })),
    insights: (Array.isArray(result.insights) ? result.insights : []).slice(0, 5).map(item => ({
      type: ['repeating', 'growing', 'compressed', 'tension'].includes(item.type) ? item.type : 'repeating',
      title: String(item.title || '记录中的变化').slice(0, 36),
      body: String(item.body || '').slice(0, 220),
      evidenceRefs: safeArray(item.evidenceRefs || (item.evidence ? [item.evidence] : []), 4, 160)
    })),
    futurePaths,
    roleModels: matchVerifiedRoleModels(futurePaths),
    letter: String(result.letter || '').slice(0, 1200),
    privacyWarnings: (Array.isArray(result.privacyWarnings) ? result.privacyWarnings : []).slice(0, 8).map(item => String(item).slice(0, 80))
  };
}

function normalizeReview(module, result, context) {
  const periods = Array.isArray(context?.periods) ? context.periods : [];
  const themes = Array.isArray(context?.themes) ? context.themes : [];
  const validKeys = new Set(themes.map(theme => theme.key));
  if (module === 'theme') {
    const shares = periods.map((_, i) => Math.max(0, Number(result.shares?.[i]) || 0));
    return { key: safeText(result.key, 24).replace(/[^a-zA-Z0-9_-]/g, ''), label: safeText(result.label, 12), color: /^#[0-9a-fA-F]{6}$/.test(result.color) ? result.color : '#673779', shares };
  }
  if (module === 'milestone') return { periodIndex: Math.min(periods.length - 1, Math.max(0, Number(result.periodIndex) || 0)), themeKey: validKeys.has(result.themeKey) ? result.themeKey : themes[0]?.key, label: safeText(result.label, 24), evidence: safeText(result.evidence, 220), meaning: safeText(result.meaning, 220) };
  if (module === 'insight') return { type: ['repeating','growing','compressed','tension'].includes(result.type) ? result.type : 'repeating', title: safeText(result.title, 36), body: safeText(result.body, 220), evidenceRefs: safeArray(result.evidenceRefs, 4, 160) };
  if (module === 'futurePath') return { key: safeText(result.key, 24).replace(/[^a-zA-Z0-9_-]/g, ''), title: safeText(result.title, 36), premise: safeText(result.premise, 180), conditions: safeArray(result.conditions, 4, 100), gain: safeText(result.gain, 180), cost: safeText(result.cost, 180), themeChanges: Object.fromEntries(Object.entries(result.themeChanges || {}).filter(([key]) => validKeys.has(key)).map(([key,value]) => [key, Math.max(-50, Math.min(50, Number(value) || 0))])), nextAction: safeText(result.nextAction, 180) };
  throw new Error('不支持的局部修订类型');
}

exports.handler = async function handler(rawEvent) {
  const event = normalizeEvent(rawEvent);
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const method = event.requestContext?.http?.method || event.httpMethod || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors(origin), body: '' };
  if (method !== 'POST') return response(405, origin, { error: '仅支持 POST 请求' });
  if (!ALLOWED_ORIGINS.has(origin)) return response(403, origin, { error: '来源未获允许' });
  if (!process.env.DASHSCOPE_API_KEY) return response(500, origin, { error: '服务尚未配置百炼密钥' });

  let input;
  try { input = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}'); }
  catch { return response(400, origin, { error: '请求格式不正确' }); }
  const diary = String(input.diary || '').trim();
  if (diary.length < 200) return response(400, origin, { error: '记录内容太少，请至少提供约200字' });
  if (diary.length > MAX_TEXT_LENGTH) return response(413, origin, { error: `记录过长，请控制在${MAX_TEXT_LENGTH}字以内` });

  const userContext = {
    nickname: String(input.nickname || '未命名').slice(0, 30),
    moment: String(input.moment || '').slice(0, 80),
    question: String(input.question || '').slice(0, 500),
    exclude: String(input.exclude || '').slice(0, 300),
    palette: String(input.palette || '暮色紫').slice(0, 20)
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110000);
  try {
    const reviewMode = input.action === 'review';
    const apiResponse = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: reviewMode ? REVIEW_PROMPT : SYSTEM_PROMPT },
          { role: 'user', content: reviewMode
            ? `module=${safeText(input.module, 30)}\n当前模块：${JSON.stringify(input.current || {})}\n报告上下文：${JSON.stringify(input.context || {})}\n用户反馈：${safeText(input.feedback, 500)}\n\n生活记录：\n${diary}`
            : `请以 JSON 分析以下材料。用户设置：${JSON.stringify(userContext)}\n文件数量：${Math.max(0, Number(input.fileCount) || 0)}\n有效字符数：${diary.length}\n\n生活记录：\n${diary}` }
        ],
        response_format: { type: 'json_object' },
        extra_body: { enable_thinking: false }
      })
    });
    const payload = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(payload?.error?.message || `百炼请求失败（${apiResponse.status}）`);
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const result = reviewMode
      ? normalizeReview(safeText(input.module, 30), { ...(input.current || {}), ...parsed }, input.context || {})
      : validateAndNormalize(parsed, { fileCount: input.fileCount, characterCount: diary.length });
    return response(200, origin, { result, usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'AbortError' ? '分析超时，请稍后重试' : String(error?.message || '分析失败');
    return response(502, origin, { error: message.slice(0, 240) });
  } finally {
    clearTimeout(timeout);
  }
};

exports.validateAndNormalize = validateAndNormalize;
exports.normalizeReview = normalizeReview;
