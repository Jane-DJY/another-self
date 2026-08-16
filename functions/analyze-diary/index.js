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

const SYSTEM_PROMPT = `你是“另世我”的生活记录分析器。只根据用户提供的记录提取可核对的模式，不诊断、不预测命运、不补造事实。
请输出严格 JSON，且只能输出 JSON。结构如下：
{
  "title":"12字以内的生命阶段标题",
  "subtitle":"30字以内的证据边界说明",
  "periods":["时间段1","时间段2","时间段3","时间段4"],
  "themes":[{"key":"英文短键","label":"中文主题","color":"#六位十六进制色","shares":[25,30,20,25]}],
  "milestones":[{"periodIndex":0,"themeKey":"对应主题key","label":"12字以内","evidence":"记录中的简短依据"}],
  "insights":[{"title":"16字以内","body":"60字以内，说明观察和依据","evidence":"来自哪些日期或原句特征"}],
  "letter":"写给当下自己的150至260字中文信，不做医疗或人生定论",
  "privacyWarnings":["检测到的可能敏感信息类型，不复述原文"]
}
规则：periods 取3至8个真实时间段；themes 取4至7个互斥主题；每个 shares 数组长度必须等于 periods，且同一时间段所有主题份额之和为100；milestones 取3至5个；insights 取3至5条。若记录日期不足，使用“前段/中段/后段”等诚实标签。不得输出真实姓名、公司名、联系方式、地址、健康细节或关系人物身份。`;

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

function validateAndNormalize(result) {
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
  return {
    title: String(result.title || '我的另世我').slice(0, 30),
    subtitle: String(result.subtitle || '基于本次提供的生活记录生成').slice(0, 80),
    periods,
    themes,
    milestones: (Array.isArray(result.milestones) ? result.milestones : []).slice(0, 5).map(item => ({
      periodIndex: Math.min(periods.length - 1, Math.max(0, Number(item.periodIndex) || 0)),
      themeKey: validKeys.has(item.themeKey) ? item.themeKey : themes[0].key,
      label: String(item.label || '重要节点').slice(0, 24),
      evidence: String(item.evidence || '').slice(0, 160)
    })),
    insights: (Array.isArray(result.insights) ? result.insights : []).slice(0, 5).map(item => ({
      title: String(item.title || '记录中的变化').slice(0, 36),
      body: String(item.body || '').slice(0, 220),
      evidence: String(item.evidence || '').slice(0, 220)
    })),
    letter: String(result.letter || '').slice(0, 1200),
    privacyWarnings: (Array.isArray(result.privacyWarnings) ? result.privacyWarnings : []).slice(0, 8).map(item => String(item).slice(0, 80))
  };
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
    const apiResponse = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请以 JSON 分析以下材料。用户设置：${JSON.stringify(userContext)}\n\n生活记录：\n${diary}` }
        ],
        response_format: { type: 'json_object' },
        extra_body: { enable_thinking: false }
      })
    });
    const payload = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(payload?.error?.message || `百炼请求失败（${apiResponse.status}）`);
    const content = payload?.choices?.[0]?.message?.content;
    const result = validateAndNormalize(JSON.parse(content));
    return response(200, origin, { result, usage: payload.usage || null });
  } catch (error) {
    const message = error?.name === 'AbortError' ? '分析超时，请稍后重试' : String(error?.message || '分析失败');
    return response(502, origin, { error: message.slice(0, 240) });
  } finally {
    clearTimeout(timeout);
  }
};
