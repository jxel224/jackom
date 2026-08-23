import { describe, expect, it } from 'vitest';
import { activatePowerUp, createQuizSession, markCorrect, markWrong, selectQuestion } from '../lib/quiz/engine';

const categories = ['world', 'science', 'history', 'language', 'sports', 'technology'];

describe('quiz engine', () => {
  it('creates the configured 36-question session', () => {
    const game = createQuizSession(categories, ['أ', 'ب']);
    expect(game.questions).toHaveLength(36);
    expect(game.teams.map((team) => team.score)).toEqual([0, 0]);
  });

  it('scores once, completes the tile, and rotates the turn', () => {
    let game = selectQuestion(createQuizSession(categories, ['أ', 'ب']), 'world-1');
    game = markCorrect(game);
    expect(game.teams[0].score).toBe(100);
    expect(game.results['world-1'].state).toBe('completed');
    expect(game.currentTeamId).toBe('team-2');
    expect(markCorrect(game)).toBe(game);
  });

  it('gives the opponent a steal after a wrong answer', () => {
    let game = markWrong(selectQuestion(createQuizSession(categories, ['أ', 'ب']), 'world-2'));
    expect(game.questionPhase).toBe('steal');
    expect(game.currentTeamId).toBe('team-2');
    game = markCorrect(game);
    expect(game.teams[1].score).toBe(200);
    expect(game.scoreEvents[0].eventType).toBe('steal');
  });

  it('consumes and applies score attack', () => {
    let game = selectQuestion(createQuizSession(categories, ['أ', 'ب']), 'world-1', 'score-attack');
    game = markCorrect(game);
    expect(game.teams.map((team) => team.score)).toEqual([100, -100]);
    expect(game.teams[0].powerUps['score-attack']).toBe(0);
  });

  it('activates a pass after reveal and penalizes an opponent miss', () => {
    let game = selectQuestion(createQuizSession(categories, ['أ', 'ب']), 'world-2');
    game = activatePowerUp(game, 'pass-trap');
    expect(game.currentTeamId).toBe('team-2');
    game = markWrong(game);
    expect(game.teams[1].score).toBe(-100);
    expect(game.results['world-2'].state).toBe('completed');
  });
});
