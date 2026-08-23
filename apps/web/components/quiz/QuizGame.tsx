'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { QUIZ_CATEGORIES } from '../../lib/quiz/catalog';
import { activatePowerUp, adjustScore, markCorrect, markWrong, noPoints, revealAnswer, selectQuestion } from '../../lib/quiz/engine';
import { loadQuizSession, saveQuizSession } from '../../lib/quiz/storage';
import type { PowerUpId, QuizSession, QuizTeam } from '../../lib/quiz/types';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

const POWER: Record<PowerUpId,{name:string;desc:string}>={
  'double-answer':{name:'فرصتان',desc:'يسمح بإجابتين لهذا السؤال'},
  'score-attack':{name:'هجمة نقاط',desc:'الصحيح يخصم القيمة نفسها من الخصم'},
  'pass-trap':{name:'الفخ',desc:'مرّر السؤال؛ الخطأ يخصم نقاطًا'},
};
export function QuizGame({id}:{id:string}) {
  const [game,setGame]=useState<QuizSession|null>(null); const [missing,setMissing]=useState(false); const [pendingPower,setPendingPower]=useState<PowerUpId|undefined>(); const [seconds,setSeconds]=useState(60); const [running,setRunning]=useState(false); const lock=useRef(false);
  useEffect(()=>{
    const found=loadQuizSession(id);
    // localStorage is unavailable during SSR; hydration is the first safe point to restore it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if(found)setGame(found);else setMissing(true)
  },[id]);
  useEffect(()=>{if(game)saveQuizSession(game)},[game]);
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>setSeconds(v=>{if(v<=1){setRunning(false);return 0}return v-1}),1000);return()=>clearInterval(timer)},[running]);
  const question=game?.questions.find(q=>q.id===game.currentQuestionId); const current=game?.teams.find(t=>t.id===game.currentTeamId);
  const commit=(fn:(g:QuizSession)=>QuizSession)=>{if(!game||lock.current)return;lock.current=true;setGame(fn(game));setRunning(false);setTimeout(()=>{lock.current=false},250)};
  const open=(qid:string)=>{if(!game)return;const next=selectQuestion(game,qid,pendingPower);if(next===game)return;setPendingPower(undefined);setSeconds(game.config.activeSeconds);setRunning(true);setGame(next)};
  if(missing)return <main className="grid min-h-screen place-items-center p-6"><Panel className="text-center"><h1 className="text-2xl font-bold">لم نجد هذه اللعبة</h1><Link className="mt-4 inline-block text-brand" href="/quiz">العودة إلى ألعابي</Link></Panel></main>;
  if(!game)return <main className="grid min-h-screen place-items-center"><p role="status">جارٍ تحميل اللعبة…</p></main>;
  if(game.status==='completed')return <Results game={game}/>;
  const completed=Object.values(game.results).filter(r=>r.state==='completed').length;
  return <main className="min-h-screen bg-surface-0 pb-8">
    <header className="sticky top-0 z-20 border-b-2 border-border-strong bg-surface-0/95 px-3 py-3 backdrop-blur"><div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3"><Score team={game.teams[0]} active={game.currentTeamId==='team-1'}/><div className="text-center"><p className="text-xs text-ink-muted">الدور الآن</p><strong>{current?.name}</strong><p className="text-xs text-ink-subtle">{completed} / {game.questions.length}</p></div><Score team={game.teams[1]} active={game.currentTeamId==='team-2'}/></div></header>
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/quiz" className="text-sm font-bold text-ink-muted">حفظ وخروج ←</Link><div className="flex flex-wrap gap-2"><span className="self-center text-xs text-ink-muted">قبل السؤال:</span><button disabled={!current?.powerUps['score-attack']} onClick={()=>setPendingPower(p=>p==='score-attack'?undefined:'score-attack')} className={`rounded-xl border px-3 py-2 text-sm font-bold disabled:opacity-35 ${pendingPower==='score-attack'?'border-brand bg-brand text-ink-on-accent':'border-border-strong bg-surface-1'}`} title={POWER['score-attack'].desc}>{POWER['score-attack'].name} ({current?.powerUps['score-attack']})</button></div></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">{game.selectedCategoryIds.map(cid=>{const cat=QUIZ_CATEGORIES.find(c=>c.id===cid)!;return <section key={cid} className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-1 p-3 sm:grid-cols-2 lg:grid-cols-1"><h2 className="col-span-3 min-h-14 text-center font-display text-lg font-bold sm:col-span-2 lg:col-span-1">{cat.icon} {cat.name}</h2>{game.questions.filter(q=>q.categoryId===cid).map(q=>{const done=!!game.results[q.id];return <button key={q.id} disabled={done} onClick={()=>open(q.id)} className="min-h-16 rounded-xl border-2 border-border-strong bg-surface-2 text-2xl font-black text-brand transition hover:-translate-y-1 hover:border-brand disabled:border-border disabled:bg-surface-0 disabled:text-ink-subtle disabled:opacity-35"><span dir="ltr">{done?'✓':q.points}</span></button>})}</section>})}</div>
      <Manual game={game} onAdjust={(team,points)=>commit(g=>adjustScore(g,team,points))}/>
    </div>
    {question?<div className="fixed inset-0 z-50 overflow-y-auto bg-surface-0/98 p-4"><div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-5"><div className="flex items-center justify-between gap-4"><div><p className="font-bold text-brand">{QUIZ_CATEGORIES.find(c=>c.id===question.categoryId)?.name} · <span dir="ltr">{question.points}</span></p><p className="text-ink-muted">{game.questionPhase==='steal'?`فرصة سرقة — ${current?.name}`:`دور ${current?.name}`}</p></div><div className={`grid h-24 w-24 place-items-center rounded-full border-4 text-4xl font-black tabular-nums ${seconds<=10?'border-danger text-danger animate-pulse':'border-brand text-brand'}`} dir="ltr">{seconds}</div></div>
      <Panel variant="hard" className="flex min-h-64 flex-col items-center justify-center gap-6 text-center"><h1 className="font-display text-3xl font-bold leading-relaxed sm:text-5xl">{question.questionText}</h1>{game.questionPhase==='revealed'?<div className="w-full rounded-2xl bg-brand/10 p-5"><p className="text-sm text-ink-muted">الإجابة</p><p className="text-3xl font-extrabold text-brand">{question.answer}</p></div>:null}</Panel>
      <div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={()=>setRunning(v=>!v)}>{running?'إيقاف مؤقت':'تشغيل المؤقت'}</Button><Button variant="secondary" onClick={()=>{setRunning(false);setSeconds(game.questionPhase==='steal'?game.config.stealSeconds:game.config.activeSeconds)}}>إعادة المؤقت</Button>{game.questionPhase==='answering'&&!game.activePowerUp?<><Button variant="secondary" disabled={!current?.powerUps['double-answer']} onClick={()=>commit(g=>activatePowerUp(g,'double-answer'))}>فرصتان</Button><Button variant="secondary" disabled={!current?.powerUps['pass-trap']} onClick={()=>commit(g=>activatePowerUp(g,'pass-trap'))}>مرّر بالفخ</Button></>:null}{game.questionPhase!=='revealed'?<Button onClick={()=>commit(revealAnswer)}>أظهر الإجابة</Button>:null}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Button size="lg" onClick={()=>commit(markCorrect)}>إجابة صحيحة</Button><Button size="lg" variant="danger" onClick={()=>commit(markWrong)} disabled={game.questionPhase==='steal'}>إجابة خاطئة</Button><Button size="lg" variant="secondary" onClick={()=>commit(noPoints)}>بدون نقاط</Button></div>
    </div></div>:null}
  </main>;
}
function Score({team,active}:{team:QuizTeam;active:boolean}){return <div className={`rounded-2xl border-2 p-2 text-center transition ${active?'border-brand bg-brand/10':'border-border'}`}><p className="truncate text-xs font-bold sm:text-lg">{team.name}</p><p className="text-2xl font-black tabular-nums sm:text-4xl" dir="ltr">{team.score}</p></div>}
function Manual({game,onAdjust}:{game:QuizSession;onAdjust:(id:QuizTeam['id'],p:number)=>void}){return <details className="rounded-2xl border border-border bg-surface-1 p-4"><summary className="cursor-pointer font-bold">تعديل يدوي للنتيجة</summary><div className="mt-3 flex flex-wrap gap-2">{game.teams.flatMap(t=>[100,-100].map(p=><Button key={`${t.id}-${p}`} size="md" variant="secondary" onClick={()=>onAdjust(t.id,p)}>{t.name} {p>0?'+':''}{p}</Button>))}</div></details>}
function Results({game}:{game:QuizSession}){const [a,b]=game.teams;const winner=a.score===b.score?null:(a.score>b.score?a:b);const stats=(id:QuizTeam['id'])=>game.scoreEvents.filter(e=>e.teamId===id);return <main className="grid min-h-screen place-items-center p-5"><Panel variant="hard" className="w-full max-w-3xl text-center"><p className="text-brand">اكتملت اللعبة!</p><h1 className="font-display text-5xl font-black">{winner?`الفائز: ${winner.name}`:'تعادل رائع!'}</h1><div className="my-8 grid grid-cols-2 gap-4">{game.teams.map(t=><div key={t.id} className="rounded-2xl bg-surface-2 p-5"><p className="text-xl font-bold">{t.name}</p><p className="text-5xl font-black" dir="ltr">{t.score}</p><p className="mt-2 text-sm text-ink-muted">{stats(t.id).filter(e=>e.eventType==='correct').length} صحيحة · {stats(t.id).filter(e=>e.eventType==='steal').length} سرقة</p></div>)}</div><p className="text-ink-muted">أُجيب عن {game.questions.length} سؤالًا</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link className="rounded-xl bg-brand px-5 py-3 font-bold text-ink-on-accent" href="/quiz/new">لعبة جديدة</Link><Link className="rounded-xl border border-border-strong px-5 py-3 font-bold" href="/quiz">ألعابي</Link><Link className="rounded-xl border border-border-strong px-5 py-3 font-bold" href="/">الرئيسية</Link></div></Panel></main>}
