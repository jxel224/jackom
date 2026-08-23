import type { QuizSession } from './types';
const KEY='jackom.quiz.sessions.v1';
export function loadQuizSessions(): QuizSession[] { try { const value=localStorage.getItem(KEY); return value ? (JSON.parse(value) as QuizSession[]) : []; } catch { return []; } }
export function saveQuizSession(session: QuizSession): boolean { try { const all=loadQuizSessions(); const next=[session,...all.filter(x=>x.id!==session.id)].slice(0,20); localStorage.setItem(KEY,JSON.stringify(next)); return true; } catch { return false; } }
export function loadQuizSession(id:string): QuizSession|null { return loadQuizSessions().find(x=>x.id===id) ?? null; }
export function deleteQuizSession(id:string): void { try { localStorage.setItem(KEY,JSON.stringify(loadQuizSessions().filter(x=>x.id!==id))); } catch {} }
