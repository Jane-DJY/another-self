import fs from 'node:fs/promises';

const groups=[
 {field:'科学技术',target:59,cats:['Chinese_women_scientists','American_women_scientists','British_women_scientists','Indian_women_scientists']},
 {field:'商业产品',target:50,cats:['Chinese_businesswomen','American_women_business_executives','British_businesswomen','Indian_businesswomen']},
 {field:'艺术创作',target:72,cats:['Chinese_women_artists','Chinese_women_writers','American_women_artists','British_women_artists','Indian_women_artists']},
 {field:'教育',target:47,cats:['Chinese_women_educators','American_women_educators','British_women_educators','Indian_women_educators']},
 {field:'医疗照护',target:50,cats:['Chinese_women_physicians','American_women_physicians','British_women_medical_doctors','Indian_women_medical_doctors']},
 {field:'公共事务',target:50,cats:['Chinese_women_in_politics','American_women_in_politics','British_women_in_politics','Indian_women_in_politics']},
 {field:'体育探险',target:50,cats:['Chinese_sportswomen','American_sportswomen','British_sportswomen','Indian_sportswomen','Women_explorers']},
 {field:'农业与技能劳动',target:38,cats:['Women_farmers','Women_chefs','Women_artisans','Women_craftworkers']},
 {field:'社区行动',target:34,cats:['Chinese_women_activists','American_women_activists','British_women_activists','Indian_women_activists']}
];
const existingText=await fs.readFile('docs/women-stars-data.js','utf8');
const existing=JSON.parse(existingText.match(/window\.WOMEN_STARS\s*=\s*([\s\S]*);\s*$/)[1]);
const used=new Set(existing.map(x=>x.name.toLowerCase()));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sparql(query){
 const u=new URL('https://dbpedia.org/sparql');u.search=new URLSearchParams({query,format:'application/sparql-results+json'});
 for(let i=0;i<5;i++){const res=await fetch(u,{headers:{'User-Agent':'LaterWomenLibrary/0.5'}});if(res.ok)return (await res.json()).results.bindings;await sleep(1200*(i+1))}
 throw new Error('DBpedia query failed');
}
const candidates=[],stats={};
for(const group of groups){
 const values=group.cats.map(x=>`dbc:${x}`).join(' ');
 const q=`PREFIX dbo: <http://dbpedia.org/ontology/> PREFIX dbc: <http://dbpedia.org/resource/Category:> PREFIX dct: <http://purl.org/dc/terms/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT DISTINCT ?person ?label ?abstract ?birth ?thumbnail ?cat WHERE { VALUES ?cat { ${values} } ?person dct:subject ?cat; a dbo:Person; rdfs:label ?label. FILTER(lang(?label)='en') OPTIONAL { ?person dbo:abstract ?abstract. FILTER(lang(?abstract)='en') } OPTIONAL { ?person dbo:birthDate ?birth } OPTIONAL { ?person dbo:thumbnail ?thumbnail } } LIMIT 1600`;
 const rows=await sparql(q),seenUri=new Set(),valid=[];
 for(const row of rows){
   const uri=row.person.value;if(seenUri.has(uri))continue;seenUri.add(uri);
   const enName=row.label.value.trim();if(!enName||used.has(enName.toLowerCase()))continue;
   valid.push(row);
 }
 valid.sort((a,b)=>Number(b.cat.value.includes('Chinese_'))-Number(a.cat.value.includes('Chinese_'))||Number(Boolean(b.abstract))-Number(Boolean(a.abstract)));
 let n=0;
 for(const row of valid){
   if(n>=group.target)break;
   const uri=row.person.value,slug=uri.split('/').pop(),enName=row.label.value.trim(),isChinese=row.cat.value.includes('Chinese_');
   const abstract=(row.abstract?.value||'Publicly documented woman; detailed life-transition research is pending.').replace(/\s+/g,' ').trim();
   const birth=String(row.birth?.value||'').match(/(\d{4})/),birthDecade=birth?`${Math.floor(Number(birth[1])/10)*10}年代`:'待补充';
   candidates.push({id:`DBP-${slug}`,dbpediaId:uri,name:enName,region:isChinese?'中国':'待补充',field:group.field,born:birthDecade,identity:abstract.length>220?abstract.slice(0,217)+'…':abstract,visibility:'较少被看见',turnAge:30,situation:'',resources:'',protect:'',action:'',outcome:'',cost:'',borrow:'',boundary:'',conditions:'',strengths:[],situationTags:[],constraintTags:[],path:'待研究',firstStep:'',sources:[uri,`https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`],evidence:'候选',editorialStatus:'基础档案·待深度核验',photo:'',photoStatus:row.thumbnail?'有公开图片线索·许可待核验':'待补',photoPage:row.thumbnail?.value||'',photoAuthor:'',photoLicense:'',seed:51+candidates.length});
   used.add(enName.toLowerCase());n++;
 }
 stats[group.field]={returned:rows.length,unique:valid.length,accepted:n};console.log(group.field,stats[group.field]);
 await sleep(550);
}
if(candidates.length<450)throw new Error(`only ${candidates.length} candidates; expected 450`);
const all=[...existing.slice(0,50).map(x=>({...x,editorialStatus:x.editorialStatus||'深度人物卡·已核验'})),...candidates.slice(0,450)];
if(all.length!==500)throw new Error(`total ${all.length}`);
const ids=all.map(x=>x.id);if(new Set(ids).size!==ids.length)throw new Error('duplicate IDs');
await fs.writeFile('docs/women-stars-data.js',`window.WOMEN_STARS = ${JSON.stringify(all,null,2)};\n`);
await fs.writeFile('docs/women-stars-candidates.json',JSON.stringify({generatedAt:new Date().toISOString(),policy:'50 deep profiles plus 450 DBpedia and Wikipedia category sourced discovery candidates',stats,candidates:candidates.slice(0,450)},null,2));
console.log(JSON.stringify({total:500,deep:50,candidates:450,stats},null,2));
