import { useCallback, useRef, useState } from 'react';

const MAX_HISTORY = 60;

/** Tracks undo/redo stroke history for the transparent Filter Creator artboard. */
export default function useFilterHistory() {
  const historyRef = useRef({ past: [], future: [] });
  const [historyVersion, setHistoryVersion] = useState(0);

  const commitAction = useCallback((action) => {
    const { past, future } = historyRef.current;
    past.push(action);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    setHistoryVersion((version) => version + 1);
  }, []);

  const pushClear = useCallback(() => {
    commitAction({ tool: 'clear' });
  }, [commitAction]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (!history.past.length) return;
    history.future.push(history.past.pop());
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (!history.future.length) return;
    history.past.push(history.future.pop());
    setHistoryVersion((version) => version + 1);
  }, []);

  const hasArtwork = historyRef.current.past.reduce((exists, action) => (action.tool === 'clear' ? false : true), false);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const actionCount = historyRef.current.past.length;

  return {
    historyRef,
    historyVersion,
    hasArtwork,
    canUndo,
    canRedo,
    actionCount,
    commitAction,
    pushClear,
    undo,
    redo,
  };
}
