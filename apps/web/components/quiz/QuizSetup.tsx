'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QUIZ_CATEGORIES } from '../../lib/quiz/catalog';
import { createQuizSession, DEFAULT_QUIZ_CONFIG } from '../../lib/quiz/engine';
import { saveQuizSession } from '../../lib/quiz/storage';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';

export function QuizSetup() {
  const router=useRouter(); const [step,setStep]=useState(0); const [selected,setSelected]=useState<string[]>([]); const [names,setNames]=useState<[string,string]>(['الفريق الأول','الفريق الثاني']);
  const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):v.length<DEFAULT_QUIZ_CONFIG.categoryCount?[...v,id]:v);
  const start=()=>{ const game=createQuizSession(selected,names); saveQuizSession(game); router.push(`/quiz/${game.id}`); };
  return <div className="flex flex-col gap-7">
    <div className="flex items-center gap-2" aria-label={`الخطوة ${step+1} من 3`}>{['الفئات','الفرق','المراجعة'].map((x,i)=><div key={x} className={`flex-1 rounded-full px-3 py-2 text-center text-sm font-bold ${i<=step?'bg-brand text-ink-on-accent':'bg-surface-2 text-ink-subtle'}`}>{x}</div>)}</div>
    {step===0?<><div><h2 className="font-display text-3xl font-bold">اختاروا ٦ فئات</h2><p className="text-ink-muted">يمكن لكل فريق اختيار ثلاث فئات بالتناوب.</p></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{QUIZ_CATEGORIES.map(c=>{const on=selected.includes(c.id);return <button type="button" aria-pressed={on} onClick={()=>toggle(c.id)} key={c.id} className={`min-h-40 rounded-3xl border-2 p-5 text-start transition ${on?'border-brand bg-brand/10 shadow-hard-brand':'border-border-strong bg-surface-1 hover:border-ink-subtle'}`}><span className="text-4xl" aria-hidden>{c.icon}</span><strong className="mt-3 block text-xl">{c.name}</strong><span className="mt-1 block text-sm text-ink-muted">{c.description}</span></button>})}</div><Button size="lg" disabled={selected.length!==6} onClick={()=>setStep(1)}>متابعة ({selected.length}/٦)</Button></>:null}
    {step===1?<Panel variant="hard" className="mx-auto flex w-full max-w-2xl flex-col gap-5"><h2 className="font-display text-3xl font-bold">جهّزوا الفريقين</h2><Input label="اسم الفريق الأول" maxLength={24} value={names[0]} onChange={e=>setNames([e.target.value,names[1]])}/><Input label="اسم الفريق الثاني" maxLength={24} value={names[1]} onChange={e=>setNames([names[0],e.target.value])}/><div className="flex gap-3"><Button variant="secondary" onClick={()=>setStep(0)}>رجوع</Button><Button disabled={!names[0].trim()||!names[1].trim()} onClick={()=>setStep(2)}>مراجعة اللعبة</Button></div></Panel>:null}
    {step===2?<Panel variant="hard" className="mx-auto flex w-full max-w-3xl flex-col gap-6"><div><h2 className="font-display text-3xl font-bold">جاهزون؟</h2><p className="text-ink-muted">٣٦ سؤالًا · ٦ فئات · فريقان · جهاز واحد للتحكم</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-brand/10 p-4 text-xl font-bold">{names[0]}</div><div className="rounded-2xl bg-action/10 p-4 text-xl font-bold">{names[1]}</div></div><div className="flex flex-wrap gap-2">{selected.map(id=><span className="rounded-full border border-border-strong px-3 py-1" key={id}>{QUIZ_CATEGORIES.find(c=>c.id===id)?.name}</span>)}</div><div className="flex gap-3"><Button variant="secondary" onClick={()=>setStep(1)}>تعديل</Button><Button size="lg" onClick={start}>ابدأ اللعبة</Button></div></Panel>:null}
  </div>;
}

