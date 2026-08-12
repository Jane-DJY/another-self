import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_FILE = 'docs/women-stars-data.js';
const ASSET_DIR = 'docs/assets/women-stars-profiles';
const REPORT_FILE = 'docs/women-stars-completeness.json';
const USER_AGENT = 'AnotherSelfWomenLibrary/2.0 (public biography completion audit)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const source = await fs.readFile(DATA_FILE, 'utf8');
const people = JSON.parse(source.match(/window\.WOMEN_STARS\s*=\s*([\s\S]*);\s*$/)[1]);
await fs.mkdir(ASSET_DIR, { recursive: true });

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const titleKey = (value) => clean(value).replace(/_/g, ' ').toLocaleLowerCase('en');
const safeName = (value) => String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 100);
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const splitSentences = (text) => [...sentenceSegmenter.segment(clean(text))].map((part) => clean(part.segment)).filter(Boolean);

async function fetchWithRetry(url, options = {}, tries = 8) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
        ...options
      });
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
      if (response.status !== 429 && response.status < 500) {
        lastError.fatal = true;
        throw lastError;
      }
      const retryAfter = Number(response.headers.get('retry-after')) || 5 + attempt * 3;
      await sleep(Math.min(30000, retryAfter * 1000));
    } catch (error) {
      lastError = error;
      if (error.fatal) throw error;
      await sleep(Math.min(12000, 800 * (attempt + 1) ** 2));
    }
  }
  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  return response.json();
}

function wikipediaTitle(person) {
  const wikipedia = (person.sources || []).find((url) => /\/wiki\//.test(url) && /wikipedia\.org/.test(url));
  if (wikipedia) return decodeURIComponent(wikipedia.split('/wiki/')[1]).replace(/_/g, ' ');
  if (person.dbpediaId) return decodeURIComponent(person.dbpediaId.split('/').pop()).replace(/_/g, ' ');
  return person.name;
}

async function loadWikipediaPages(records) {
  const result = new Map();
  async function requestBatch(batch, cacheBust = '') {
    const inputTitles = batch.map(wikipediaTitle);
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'extracts|pageimages|pageprops|description',
      exintro: '1',
      explaintext: '1',
      piprop: 'thumbnail|original',
      pithumbsize: '900',
      maxage: '0',
      smaxage: '0',
      titles: inputTitles.join('|'),
      women_library_refresh: cacheBust
    });
    const payload = await fetchJson(url);
    const normalized = new Map((payload.query?.normalized || []).map((item) => [titleKey(item.from), item.to]));
    const redirects = new Map((payload.query?.redirects || []).map((item) => [titleKey(item.from), item.to]));
    const pages = payload.query?.pages || [];
    for (const person of batch) {
      const input = wikipediaTitle(person);
      const normalizedTitle = normalized.get(titleKey(input)) || input;
      const redirectedTitle = redirects.get(titleKey(normalizedTitle)) || normalizedTitle;
      const page = pages.find((candidate) => titleKey(candidate.title) === titleKey(redirectedTitle));
      if (page && !page.missing && !page.pageprops?.disambiguation) result.set(person.id, page);
    }
  }
  for (let offset = 0; offset < records.length; offset += 35) {
    const batch = records.slice(offset, offset + 35);
    await requestBatch(batch, `initial-${offset}-${Date.now()}`);
    console.log(`Wikipedia ${Math.min(offset + batch.length, records.length)}/${records.length}`);
    await sleep(2600);
  }
  for (let round = 1; round <= 3; round += 1) {
    const incomplete = records.filter((person) => !clean(result.get(person.id)?.extract));
    if (!incomplete.length) break;
    console.log(`Wikipedia retry ${round}: ${incomplete.length} incomplete biographies`);
    for (let offset = 0; offset < incomplete.length; offset += 18) {
      await requestBatch(incomplete.slice(offset, offset + 18), `retry-${round}-${offset}-${Date.now()}`);
      await sleep(1200);
    }
  }
  for (let round = 1; round <= 2; round += 1) {
    const missingImages = records.filter((person) => {
      const page = result.get(person.id);
      return page && !page.thumbnail?.source && !page.original?.source;
    });
    if (!missingImages.length) break;
    console.log(`Wikipedia image retry ${round}: ${missingImages.length} missing portraits`);
    for (let offset = 0; offset < missingImages.length; offset += 15) {
      await requestBatch(missingImages.slice(offset, offset + 15), `image-${round}-${offset}-${Date.now()}`);
      await sleep(900);
    }
  }
  return result;
}

async function loadWikidata(pages) {
  const qids = [...new Set([...pages.values()].map((page) => page.pageprops?.wikibase_item).filter(Boolean))];
  const facts = new Map();
  for (let offset = 0; offset < qids.length; offset += 55) {
    const batch = qids.slice(offset, offset + 55);
    const query = `SELECT ?item ?itemLabel ?itemDescription ?birth ?death ?countryLabel ?birthPlaceLabel ?occupationLabel ?genderLabel ?image WHERE {
      VALUES ?item { ${batch.map((qid) => `wd:${qid}`).join(' ')} }
      OPTIONAL { ?item wdt:P569 ?birth. }
      OPTIONAL { ?item wdt:P570 ?death. }
      OPTIONAL { ?item wdt:P27 ?country. }
      OPTIONAL { ?item wdt:P19 ?birthPlace. }
      OPTIONAL { ?item wdt:P106 ?occupation. }
      OPTIONAL { ?item wdt:P21 ?gender. }
      OPTIONAL { ?item wdt:P18 ?image. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en". }
    }`;
    const url = new URL('https://query.wikidata.org/sparql');
    url.search = new URLSearchParams({ query, format: 'json' });
    const payload = await fetchJson(url);
    for (const row of payload.results?.bindings || []) {
      const qid = row.item.value.split('/').pop();
      const current = facts.get(qid) || { countries: new Set(), birthPlaces: new Set(), occupations: new Set(), genders: new Set(), images: new Set() };
      current.label = clean(row.itemLabel?.value) || current.label;
      current.description = clean(row.itemDescription?.value) || current.description;
      current.birth = row.birth?.value || current.birth;
      current.death = row.death?.value || current.death;
      if (row.countryLabel?.value) current.countries.add(clean(row.countryLabel.value));
      if (row.birthPlaceLabel?.value) current.birthPlaces.add(clean(row.birthPlaceLabel.value));
      if (row.occupationLabel?.value) current.occupations.add(clean(row.occupationLabel.value));
      if (row.genderLabel?.value) current.genders.add(clean(row.genderLabel.value));
      if (row.image?.value) current.images.add(row.image.value);
      facts.set(qid, current);
    }
    console.log(`Wikidata ${Math.min(offset + batch.length, qids.length)}/${qids.length}`);
    await sleep(1400);
  }
  return facts;
}

function decade(value, fallback) {
  const year = Number(String(value || '').match(/(18|19|20)\d{2}/)?.[0]);
  if (year) return `${Math.floor(year / 10) * 10}年代`;
  return fallback && fallback !== '待补充' ? fallback : '出生年份未见于当前公开条目';
}

function transitionAge(extract, birth, death) {
  const birthYear = Number(String(birth || '').match(/(18|19|20)\d{2}/)?.[0]);
  if (!birthYear) return '公开生平阶段';
  const deathYear = Number(String(death || '').match(/(18|19|20)\d{2}/)?.[0]);
  const years = [...clean(extract).matchAll(/\b((?:18|19|20)\d{2})\b/g)].map((match) => Number(match[1]));
  const eventYear = years
    .filter((year) => year > birthYear + 14 && year < birthYear + 90 && year !== deathYear)
    .sort((a, b) => a - b)[0];
  return eventYear ? eventYear - birthYear : '公开生平阶段';
}

const fieldConfig = {
  科学技术: { strengths: ['专业深耕', '长期主义', '求证'], firstStep: '选一个她公开研究过的问题，用 30 分钟读完一份可靠资料，并写下一个仍待验证的问题。' },
  商业产品: { strengths: ['创造', '组织', '长期主义'], firstStep: '挑一个真实使用场景，访谈一位使用者，记录她最具体的一次困难，不急着给解决方案。' },
  艺术创作: { strengths: ['创造', '表达', '长期主义'], firstStep: '用 30 分钟完成一个尺寸很小的作品草稿，只检验一种表达方法。' },
  教育: { strengths: ['照护', '表达', '组织'], firstStep: '把一个你熟悉的知识点讲给一位具体的人，并记录对方真正卡住的地方。' },
  医疗照护: { strengths: ['照护', '专业深耕', '边界感'], firstStep: '选一项你在意的健康议题，只阅读一个权威机构页面，整理三条可核对的信息。' },
  公共事务: { strengths: ['组织', '表达', '边界感'], firstStep: '选一个与你生活直接相关的公共问题，找到负责机构与正式反馈渠道，写下事实而非情绪判断。' },
  体育探险: { strengths: ['冒险', '长期主义', '重新开始'], firstStep: '为一个身体目标安排一次 20 分钟、可随时停止的练习，并记录身体反馈。' },
  农业与技能劳动: { strengths: ['专业深耕', '长期主义', '创造'], firstStep: '选一项手上技能，完成一个 30 分钟可见的小成品，并拍下过程中的三个步骤。' },
  社区行动: { strengths: ['组织', '照护', '表达'], firstStep: '联系一位与你关心同一问题的人，只交换一次具体经验与一个可验证的小需求。' },
  家庭生活与中年重启: { strengths: ['重新开始', '边界感', '照护'], firstStep: '为自己单独留出 30 分钟，写下目前最想守住的一件事和最想改变的一件事。' }
};

function completeRecord(person, page, facts) {
  const extract = clean(page?.extract);
  if (!extract) return false;
  const sentences = splitSentences(extract);
  const occupations = [...(facts?.occupations || [])].filter((value) => !/^Q\d+$/.test(value)).slice(0, 5);
  const genders = [...(facts?.genders || [])].filter((value) => !/^Q\d+$/.test(value));
  const countries = [...(facts?.countries || [])].filter((value) => !/^Q\d+$/.test(value));
  const birthPlaces = [...(facts?.birthPlaces || [])].filter((value) => !/^Q\d+$/.test(value));
  const descriptor = clean(facts?.description || page.description);
  const contextParts = [];
  if (occupations.length) contextParts.push(`公开职业身份包括${occupations.join('、')}`);
  if (birthPlaces.length) contextParts.push(`出生地记录为${birthPlaces.join('、')}`);
  const config = fieldConfig[person.field] || fieldConfig['艺术创作'];
  const verifiedLabel = clean(facts?.label);
  if (verifiedLabel && !/^Q\d+$/.test(verifiedLabel)) person.name = verifiedLabel;
  else if (/^Q\d+$/.test(person.name)) person.name = page.title;
  person.region = countries.length ? countries.join('／') : (person.region && person.region !== '待补充' ? person.region : '当前公开条目未标注国籍');
  person.born = decade(facts?.birth, person.born);
  person.identity = descriptor ? `${descriptor}。${sentences[0] || extract}` : (sentences[0] || extract);
  person.gender = genders.join('／') || '女性（由女性人物分类收录，Wikidata 当前未返回性别字段）';
  person.turnAge = transitionAge(extract, facts?.birth, facts?.death);
  person.situation = sentences.slice(0, 2).join(' ') || extract;
  person.resources = contextParts.length ? `${contextParts.join('；')}。` : '现有公开条目主要记录其职业经历，未披露家庭、经济与关系支持等私人资源。';
  person.protect = `保留她在${occupations[0] || person.field}领域中已经发生并可被核对的贡献。`;
  person.action = sentences.slice(1, 4).join(' ') || sentences[0] || extract;
  person.outcome = sentences.length > 1 ? sentences.slice(-2).join(' ') : `${person.name}的经历被收录在公开人物资料中。`;
  person.cost = '当前公开来源没有足够材料说明她个人承担的代价；不据此推断未公开的感受、动机或关系经历。';
  person.borrow = `从她在${occupations[0] || person.field}领域的公开行动中，拆出一个低风险、可验证的小步骤。`;
  person.boundary = '本卡只整理公开记录中的身份、事件与结果；时代条件、制度资源和个人机会不能直接复制。';
  person.conditions = `适合正在探索${person.field}或相近人生路径的人；借鉴行动方式，不把结果当作必然。`;
  person.strengths = config.strengths;
  person.situationTags = ['职业路径', person.field];
  person.constraintTags = ['公开资料有限', '时代条件不同'];
  person.path = `${occupations[0] || person.field}的公开生平路径`;
  person.firstStep = config.firstStep;
  const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
  const qid = page.pageprops?.wikibase_item;
  person.sources = [...new Set([pageUrl, qid ? `https://www.wikidata.org/wiki/${qid}` : '', person.dbpediaId || ''].filter(Boolean))];
  person.evidence = 'Wikipedia 人物条目与 Wikidata 结构化资料交叉整理；关键事实仍以页面列出的原始参考文献为准。';
  person.editorialStatus = '公开资料卡·已补全';
  person._candidatePhoto = [...(facts?.images || [])][0] || page.thumbnail?.source || page.original?.source || '';
  if (person._candidatePhoto) {
    person.photo = person._candidatePhoto;
    person.photoStatus = 'Wikipedia／Wikimedia 人物照片';
    person.photoPage = pageUrl;
    person.photoAuthor = 'Wikipedia / Wikimedia contributor';
    person.photoLicense = '具体许可见人物条目与对应原图页';
    person.photoVerified = true;
  } else {
    person.photo = '';
    person.photoStatus = '当前公开条目未提供可核验人物肖像';
    person.photoPage = '';
    person.photoAuthor = '';
    person.photoLicense = '';
    person.photoVerified = false;
  }
  return true;
}

async function commonsPhoto(person) {
  const queryName = person.name.replace(/\([^)]*\)/g, '').trim();
  const tokens = queryName.toLocaleLowerCase('en').match(/[a-z]{3,}/g) || [];
  if (!tokens.length) return null;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrnamespace: '6', gsrlimit: '8', gsrsearch: `intitle:"${queryName}"`,
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '900'
  });
  const payload = await fetchJson(url);
  const candidates = (payload.query?.pages || []).filter((page) => {
    const title = page.title.toLocaleLowerCase('en');
    return tokens.every((token) => title.includes(token));
  });
  const page = candidates[0];
  const info = page?.imageinfo?.[0];
  return info ? { url: info.thumburl || info.url, page: info.descriptionurl, author: clean(info.extmetadata?.Artist?.value).replace(/<[^>]+>/g, '') || 'Wikimedia Commons contributor', license: clean(info.extmetadata?.LicenseShortName?.value) || '具体许可见 Wikimedia Commons 原图页' } : null;
}

async function downloadImage(person, candidate, index) {
  if (!candidate) return false;
  try {
    const candidateUrl = candidate.url || candidate;
    let bytes;
    let ext;
    if (!/^https?:/i.test(candidateUrl)) {
      const sourcePath = path.resolve('docs', candidateUrl);
      bytes = await fs.readFile(sourcePath);
      ext = path.extname(sourcePath).replace('.', '').toLowerCase() || 'jpg';
    } else {
      const response = await fetchWithRetry(candidateUrl, {}, 4);
      const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
      if (!type.startsWith('image/')) return false;
      bytes = Buffer.from(await response.arrayBuffer());
      ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[type] || 'jpg';
    }
    if (bytes.length < 2500) return false;
    const filename = `${String(index + 1).padStart(3, '0')}-${safeName(person.id)}.${ext}`;
    await fs.writeFile(path.join(ASSET_DIR, filename), bytes);
    person.photo = `assets/women-stars-profiles/${filename}`;
    person.photoStatus = '人物照片·本地可用副本';
    person.photoPage = candidate.page || person.sources?.[0] || '';
    person.photoAuthor = candidate.author || 'Wikipedia / Wikimedia contributor';
    person.photoLicense = candidate.license || '具体许可见照片来源页';
    return true;
  } catch {
    return false;
  }
}

const candidates = people.filter((person) => !person.editorialStatus?.startsWith('深度'));
const pages = await loadWikipediaPages(candidates);
const wikidata = await loadWikidata(pages);
for (const person of people.filter((record) => record.editorialStatus?.startsWith('深度'))) {
  if (person.born === '待补充') person.born = '当前公开资料未标注出生年份';
  if (person.photo && !/thum\.io/.test(person.photo)) person.photoVerified = true;
}
let completed = 0;
for (const person of candidates) {
  const page = pages.get(person.id);
  const qid = page?.pageprops?.wikibase_item;
  if (completeRecord(person, page, wikidata.get(qid))) completed += 1;
}

const metadataOnly = process.env.WOMEN_METADATA_ONLY === '1';
let photoCursor = 0;
let savedPhotos = 0;
const needsCommons = [];
const unresolvedPhotos = [];
async function primaryPhotoWorker() {
  while (photoCursor < people.length) {
    const index = photoCursor++;
    const person = people[index];
    let candidate = person._candidatePhoto ? { url: person._candidatePhoto, page: person.sources?.[0] } : null;
    if (!candidate && person.photo && !/thum\.io/.test(person.photo)) candidate = { url: person.photo, page: person.photoPage, author: person.photoAuthor, license: person.photoLicense };
    const saved = await downloadImage(person, candidate, index);
    delete person._candidatePhoto;
    if (saved) savedPhotos += 1;
    else needsCommons.push({ person, index });
    if ((index + 1) % 50 === 0) console.log(`Photos ${index + 1}/${people.length}; saved ${savedPhotos}`);
    await sleep(220);
  }
}
if (!metadataOnly) await Promise.all(Array.from({ length: 3 }, primaryPhotoWorker));

for (let cursor = 0; !metadataOnly && cursor < needsCommons.length; cursor += 1) {
  const { person, index } = needsCommons[cursor];
  const commons = await commonsPhoto(person).catch(() => null);
  const saved = await downloadImage(person, commons, index);
  if (saved) savedPhotos += 1;
  else {
    person.photo = '';
    person.photoStatus = '未通过照片核验';
    unresolvedPhotos.push({ id: person.id, name: person.name, sources: person.sources });
  }
  if ((cursor + 1) % 20 === 0) console.log(`Commons ${cursor + 1}/${needsCommons.length}; total photos ${savedPhotos}`);
  await sleep(650);
}

if (metadataOnly) {
  for (const person of people) {
    if (person.editorialStatus?.startsWith('深度') && person.photo && !/^https?:/i.test(person.photo)) {
      person.photoVerified = true;
    }
    delete person._candidatePhoto;
  }
  savedPhotos = people.filter((person) => person.photo && !/thum\.io/.test(person.photo)).length;
}

const placeholderPattern = /待补充|待研究|research is pending|资料页预览|本人照片待补/i;
const required = ['name', 'region', 'field', 'born', 'identity', 'situation', 'resources', 'action', 'outcome', 'cost', 'boundary', 'conditions', 'firstStep'];
const readable = people.filter((person) => {
  const femaleRecord = person.editorialStatus?.startsWith('深度') || /female|女性|女/i.test(person.gender || '');
  return femaleRecord && person.photoVerified === true && person.photo && required.every((key) => clean(person[key])) && !placeholderPattern.test(JSON.stringify(person));
});
for (const person of people) person.publicReady = readable.includes(person);

await fs.writeFile(DATA_FILE, `window.WOMEN_STARS = ${JSON.stringify(people, null, 2)};\n`);
await fs.writeFile(REPORT_FILE, JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: people.length,
  wikipediaPages: pages.size,
  completedFromPublicSources: completed,
  savedPhotos,
  publicReady: readable.length,
  unresolvedProfiles: people.filter((person) => !person.publicReady).map((person) => ({ id: person.id, name: person.name, hasPhoto: Boolean(person.photo), hasBiography: Boolean(clean(person.identity) && !placeholderPattern.test(person.identity)), sources: person.sources })),
  unresolvedPhotos
}, null, 2));

console.log(JSON.stringify({ total: people.length, wikipediaPages: pages.size, completed, savedPhotos, publicReady: readable.length, unresolved: people.length - readable.length }, null, 2));
