"use client";

import { useState } from "react";

const directions = [
  "在不确定中做出选择",
  "在专业里建立力量",
  "重新开始一条路",
  "把表达做成作品",
  "在关系中守住自己",
];

const pioneers = [
  { name: "埃达·洛芙莱斯", en: "Ada Lovelace", note: "把想象力变成了一个尚未存在的未来。" },
  { name: "吴健雄", en: "Chien-Shiung Wu", note: "在漫长的专业训练里，把判断交给事实与行动。" },
  { name: "扎哈·哈迪德", en: "Zaha Hadid", note: "当路径还没有门，她先做出一条自己的路。" },
];

export default function Home() {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState("");
  const [reflection, setReflection] = useState("");
  const next = () => setStep((value) => Math.min(value + 1, 3));
  const back = () => setStep((value) => Math.max(value - 1, 0));

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top">另世我 <span>Another Self</span></a>
        <div className="progress" aria-label={`第 ${step + 1} 步，共 4 步`}>
          {[0, 1, 2, 3].map((item) => <i className={item <= step ? "on" : ""} key={item} />)}
        </div>
        <button className="quiet">已有档案</button>
      </header>

      <section id="top" className="stage">
        {step === 0 && <Welcome onNext={next} />}
        {step === 1 && <CheckIn reflection={reflection} setReflection={setReflection} onNext={next} onBack={back} />}
        {step === 2 && <Direction value={direction} setValue={setDirection} onNext={next} onBack={back} />}
        {step === 3 && <Result direction={direction} reflection={reflection} onBack={back} />}
      </section>
      <footer>另世我不是预测。它用你的生活记录，陪你看见变化与下一步。</footer>
    </main>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return <div className="hero fade">
    <p className="eyebrow">一份会慢慢长大的个人导航</p>
    <h1>你认真生活的每一天，<br /><em>都在长成另一个你。</em></h1>
    <p className="lead">不需要上传日记。先用几分钟，看看此刻什么样的女性力量最能照亮你。</p>
    <button className="primary" onClick={onNext}>开始认识此刻的我 <b>→</b></button>
    <p className="micro">约 2 分钟 · 不会公开你的回答</p>
  </div>;
}

function CheckIn({ reflection, setReflection, onNext, onBack }: { reflection: string; setReflection: (value: string) => void; onNext: () => void; onBack: () => void }) {
  return <div className="form fade">
    <p className="eyebrow">01 / 此刻</p>
    <h2>最近，什么最占据你的心？</h2>
    <p className="sub">写一句就好。以后你也可以选择导入更多记录。</p>
    <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="例如：我有一份稳定工作，但总觉得自己还没有真正开始。" />
    <div className="actions"><button className="text" onClick={onBack}>← 返回</button><button className="primary" onClick={onNext}>继续 <b>→</b></button></div>
  </div>;
}

function Direction({ value, setValue, onNext, onBack }: { value: string; setValue: (value: string) => void; onNext: () => void; onBack: () => void }) {
  return <div className="form fade">
    <p className="eyebrow">02 / 向往</p>
    <h2>现在，你想靠近哪一种力量？</h2>
    <p className="sub">不是给你贴标签，只是选择一个此刻想获得的参照。</p>
    <div className="choices">{directions.map((item, index) => <button key={item} className={value === item ? "choice selected" : "choice"} onClick={() => setValue(item)}><span>0{index + 1}</span>{item}<b>↗</b></button>)}</div>
    <div className="actions"><button className="text" onClick={onBack}>← 返回</button><button className="primary" disabled={!value} onClick={onNext}>看看我的同行者 <b>→</b></button></div>
  </div>;
}

function Result({ direction, reflection, onBack }: { direction: string; reflection: string; onBack: () => void }) {
  const chosen = direction || directions[0];
  return <div className="result fade">
    <p className="eyebrow">03 / 同行者</p>
    <h2>你正在寻找的，或许是<br /><em>{chosen}</em></h2>
    <p className="sub quote">“{reflection || "你不需要立刻知道全部答案。"}”</p>
    <div className="line" />
    <p className="recommend-label">此刻可以遇见的三位女性</p>
    <div className="people">{pioneers.map((person, index) => <article key={person.name}><span>0{index + 1}</span><div><h3>{person.name}</h3><small>{person.en}</small><p>{person.note}</p></div><b>↗</b></article>)}</div>
    <div className="next-step"><span>这一周的小尝试</span><strong>写下一个你愿意尝试、但不必一次成功的行动。</strong></div>
    <div className="actions"><button className="text" onClick={onBack}>← 修改选择</button><button className="primary">保存我的另世我 <b>→</b></button></div>
  </div>;
}
