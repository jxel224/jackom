import { questionsFor } from './catalog';
import type { PowerUpId, QuizConfig, QuizSession, QuizTeam, ScoreEventType } from './types';

export const DEFAULT_QUIZ_CONFIG: QuizConfig = { categoryCount: 6, questionsPerCategory: 6, pointValues: [100,200,300,400,500,600], activeSeconds: 60, stealSeconds: 10, scoreAttackMultiplier: 1, trapPenalty: 100 };
const now = () => new Date().toISOString();
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const other = (id: QuizTeam['id']): QuizTeam['id'] => id === 'team-1' ? 'team-2' : 'team-1';

export function createQuizSession(categoryIds: string[], names: [string,string], config = DEFAULT_QUIZ_CONFIG): QuizSession {
  const stamp = now();
  const powerUps = (): Record<PowerUpId, number> => ({ 'double-answer': 1, 'score-attack': 1, 'pass-trap': 1 });
  return { version: 1, id: uid(), status: 'active', createdAt: stamp, updatedAt: stamp, selectedCategoryIds: categoryIds,
    teams: [{ id:'team-1', name:names[0] || 'الفريق الأول', color:'#c6ff3d', score:0, powerUps:powerUps() }, { id:'team-2', name:names[1] || 'الفريق الثاني', color:'#9d5cff', score:0, powerUps:powerUps() }],
    questions: questionsFor(categoryIds, config.pointValues), results:{}, scoreEvents:[], currentTeamId:'team-1', gameStartedAt:stamp, config };
}

export function selectQuestion(session: QuizSession, questionId: string, powerUp?: PowerUpId): QuizSession {
  if (session.currentQuestionId || session.results[questionId]) return session;
  if (powerUp && session.teams.find(t=>t.id===session.currentTeamId)!.powerUps[powerUp] <= 0) return session;
  const teams = session.teams.map(t => t.id === session.currentTeamId && powerUp ? {...t, powerUps:{...t.powerUps,[powerUp]:t.powerUps[powerUp]-1}} : t) as QuizSession['teams'];
  return {...session, teams, currentQuestionId:questionId, questionPhase:'answering', activePowerUp:powerUp, results:{...session.results,[questionId]:{questionId,state:'active',selectedBy:session.currentTeamId,powerUp}}, updatedAt:now()};
}

export function activatePowerUp(session: QuizSession, powerUp: Exclude<PowerUpId, 'score-attack'>): QuizSession {
  if (!session.currentQuestionId || session.questionPhase !== 'answering' || session.activePowerUp) return session;
  const selectedBy = session.results[session.currentQuestionId]?.selectedBy;
  const team = session.teams.find((candidate) => candidate.id === selectedBy);
  if (!team || team.powerUps[powerUp] <= 0) return session;
  const teams = session.teams.map((candidate) => candidate.id === selectedBy
    ? { ...candidate, powerUps: { ...candidate.powerUps, [powerUp]: candidate.powerUps[powerUp] - 1 } }
    : candidate) as QuizSession['teams'];
  return {
    ...session,
    teams,
    activePowerUp: powerUp,
    currentTeamId: powerUp === 'pass-trap' ? other(selectedBy) : session.currentTeamId,
    results: { ...session.results, [session.currentQuestionId]: { ...session.results[session.currentQuestionId], powerUp } },
    updatedAt: now(),
  };
}

function award(session: QuizSession, teamId: QuizTeam['id'], points: number, eventType: ScoreEventType, questionId?: string): QuizSession {
  return {...session, teams:session.teams.map(t=>t.id===teamId?{...t,score:t.score+points}:t) as QuizSession['teams'], scoreEvents:[...session.scoreEvents,{id:uid(),gameId:session.id,questionId,teamId,points,eventType,timestamp:now()}]};
}

export function revealAnswer(session: QuizSession): QuizSession { return session.currentQuestionId ? {...session,questionPhase:'revealed',updatedAt:now()} : session; }
export function markWrong(session: QuizSession): QuizSession {
  if (!session.currentQuestionId || session.questionPhase === 'steal') return session;
  if (session.activePowerUp === 'pass-trap') return finish(session, undefined, 'wrong', session.currentTeamId, -session.config.trapPenalty, 'penalty');
  return {...session, questionPhase:'steal', currentTeamId:other(session.currentTeamId), updatedAt:now()};
}
export function markCorrect(session: QuizSession): QuizSession {
  const q = session.questions.find(x=>x.id===session.currentQuestionId); if (!q) return session;
  const isSteal = session.questionPhase === 'steal';
  let next = finish(session, session.currentTeamId, isSteal?'steal':'correct', session.currentTeamId, q.points, isSteal?'steal':'correct');
  if (session.activePowerUp === 'score-attack' && !isSteal) next = award(next, other(session.currentTeamId), -q.points * session.config.scoreAttackMultiplier, 'powerup', q.id);
  return next;
}
export function noPoints(session: QuizSession): QuizSession { return session.currentQuestionId ? finish(session,undefined,'no-points') : session; }
function finish(session: QuizSession, awardedTo: QuizTeam['id']|undefined, outcome:'correct'|'wrong'|'steal'|'no-points', eventTeam?:QuizTeam['id'], points?:number, type?:ScoreEventType): QuizSession {
  const id=session.currentQuestionId!; let next=session;
  if(eventTeam && points && type) next=award(next,eventTeam,points,type,id);
  const results={...next.results,[id]:{...next.results[id],state:'completed' as const,awardedTo,outcome}};
  const completed=Object.values(results).filter(r=>r.state==='completed').length >= next.questions.length;
  return {...next,results,currentQuestionId:undefined,questionPhase:undefined,activePowerUp:undefined,currentTeamId:other(next.results[id]?.selectedBy ?? next.currentTeamId),status:completed?'completed':'active',gameCompletedAt:completed?now():undefined,updatedAt:now()};
}
export function adjustScore(session: QuizSession, teamId: QuizTeam['id'], points: number): QuizSession { return {...award(session,teamId,points,'manual_adjustment'),updatedAt:now()}; }
