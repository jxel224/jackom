'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GameplayFallback } from './GameplayStates';

export class GameplayErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') console.error('Gameplay renderer failed', error.message, info.componentStack);
  }
  render() { return this.state.failed ? <GameplayFallback /> : this.props.children; }
}
