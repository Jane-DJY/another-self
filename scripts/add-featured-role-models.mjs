import fs from 'node:fs';

const path='docs/women-stars-data.js';
const text=fs.readFileSync(path,'utf8');
const data=JSON.parse(text.match(/window\.WOMEN_STARS\s*=\s*([\s\S]*);\s*$/)[1]);
const shared={visibility:'较少被看见',resources:'专业训练、公开创作与同行网络',protect:'保留专业深度，同时建立自己的表达方法',cost:'长期积累、持续公开作品，并承受职业路径的不确定性',borrow:'把长期方向缩小成可重复的个人实验',conditions:'适合希望把技术、研究或观察转化为公开作品的人',strengths:['创造','专业深耕','长期主义'],situationTags:['创作转型','职业身份变化'],constraintTags:['时间有限','路径不确定'],path:'从专业工作到独立方法',evidence:'本人网站与公开专业档案交叉核验',editorialStatus:'深度人物卡·已核验',photo:'',photoStatus:'待补',photoPage:'',photoAuthor:'',photoLicense:''};
const featured=[
 {...shared,id:'FEATURED-GIORGIA-LUPI',name:'Giorgia Lupi',region:'意大利／美国',field:'艺术创作',born:'1980年代',identity:'信息设计师、Pentagram 合伙人、Accurat 联合创办人',turnAge:30,situation:'接受建筑与信息设计训练后，她需要把数据分析发展成一种具有人文感的视觉语言。',action:'2011 年联合创办 Accurat；随后通过《Dear Data》等长期个人实验，把日常数据、手绘与叙事结合。',outcome:'形成“数据人文主义”的鲜明方法，并于 2019 年成为 Pentagram 合伙人。',boundary:'她拥有长期专业训练、国际设计网络与机构合作机会；不能只复制视觉风格而忽略持续采集、解释和写作。',firstStep:'连续 7 天记录一个很小的生活变量，并尝试用同一套视觉符号画出来。',sources:['https://www.pentagram.com/about/giorgia-lupi','https://giorgialupi.com/'],seed:496},
 {...shared,id:'FEATURED-NADIEH-BREMER',name:'Nadieh Bremer',region:'荷兰',field:'艺术创作',born:'待补充',identity:'数据可视化设计师、Visual Cinnamon 创办人、《Data Sketches》合著者',turnAge:'职业转型期',situation:'从天文学和数据科学背景进入创作时，她需要在分析能力与视觉叙事之间建立自己的工作方式。',action:'持续公开 D3 与视觉实验，把草图、数据分析、设计和代码发展为定制可视化流程，并以 Visual Cinnamon 独立执业。',outcome:'形成以复杂数据和定制视觉叙事见长的个人实践，并与 Shirley Wu 合著《Data Sketches》。',boundary:'技术复杂度不是目标本身；项目仍需从数据、受众与传播问题出发。',firstStep:'选一份熟悉的小数据，在纸上画三种完全不同的表达草图，再决定是否写代码。',sources:['https://www.visualcinnamon.com/about/','https://en.wikipedia.org/wiki/Nadieh_Bremer'],seed:497},
 {...shared,id:'FEATURED-SHIRLEY-WU',name:'Shirley Wu',region:'美国',field:'艺术创作',born:'待补充',identity:'数据艺术家与数据可视化创作者、《Data Sketches》合著者',turnAge:'职业早期',situation:'在软件工程工作之外，她希望把代码、设计和讲故事放进同一个创作身份中。',action:'从软件工程转向独立数据可视化，持续公开个人作品、合作项目、演讲与创作过程。',outcome:'形成鲜明的数据驱动艺术与叙事作品语言，并建立独立创作者的专业声誉。',boundary:'公开作品能积累声誉，但需要共同母题与持续方法；项目数量本身不等于清晰的创作身份。',firstStep:'从过去三个作品中找出一个反复出现的主题，用一句话写下你想长期追问的问题。',sources:['https://sxywu.github.io/','https://en.wikipedia.org/wiki/Shirley_Wu'],seed:498},
 {...shared,id:'FEATURED-ANNE-LAURE',name:'Anne-Laure Le Cunff',region:'法国／英国',field:'教育',born:'1980年代',identity:'Ness Labs 创办人、神经科学研究者、《Tiny Experiments》作者',turnAge:'职业转型期',situation:'离开 Google 并经历一次没有持续的创业尝试后，她需要重新寻找工作、学习与好奇心之间的关系。',action:'用连续写作和小型实验公开研究自己的问题，逐步发展 Ness Labs 社区，并继续接受神经科学训练。',outcome:'把内容、社区、研究与教育产品连接起来，形成围绕好奇心和实验式生活的长期事业。',boundary:'这条路径建立在英语写作能力、科技行业经验与长期公开输出上；不能把“辞职”当作可复制的第一步。',firstStep:'写下一个困扰你的问题，为它设计一个一周内可撤回、可观察结果的小实验。',sources:['https://anne-laure.net/','https://nesslabs.com/author/annelaure'],seed:499}
];
const ids=new Set(featured.map(x=>x.id));
const names=new Set(featured.map(x=>x.name.toLowerCase()));
const retained=data.filter(x=>!ids.has(x.id)&&!names.has(x.name.toLowerCase())).slice(0,500-featured.length);
const next=[...featured,...retained];
if(next.length!==500||new Set(next.map(x=>x.id)).size!==500||new Set(next.map(x=>x.name.toLowerCase())).size!==500)throw new Error('featured role model merge failed');
fs.writeFileSync(path,`window.WOMEN_STARS = ${JSON.stringify(next,null,2)};\n`);
console.log(`saved ${next.length} people including ${featured.length} featured recommendations`);
