import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useCompareState } from './useCompareState.js';

function wrapper(initialUrl: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialUrl]}>
        {children}
      </MemoryRouter>
    );
  };
}

describe('useCompareState', () => {
  it('parses initial counties and metric from URL', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare?counties=24031,24027&metric=zhvi'),
    });
    expect(result.current.selected).toEqual(['24031', '24027']);
    expect(result.current.metric).toBe('zhvi');
  });

  it('defaults metric to zhvi when absent', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare'),
    });
    expect(result.current.metric).toBe('zhvi');
    expect(result.current.selected).toEqual([]);
  });

  it('toggle adds a county to the selection', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare?counties=24031,24027&metric=zhvi'),
    });
    act(() => result.current.toggle('11001'));
    expect(result.current.selected).toContain('11001');
    expect(result.current.selected).toHaveLength(3);
  });

  it('toggle removes a county already selected', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare?counties=24031,24027&metric=zhvi'),
    });
    act(() => result.current.toggle('24031'));
    expect(result.current.selected).not.toContain('24031');
    expect(result.current.selected).toHaveLength(1);
  });

  it('caps at 5 counties — 6th toggle is no-op', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare?counties=24031,24027,11001,51059,51107&metric=zhvi'),
    });
    act(() => result.current.toggle('51013'));
    expect(result.current.selected).toHaveLength(5);
    expect(result.current.selected).not.toContain('51013');
  });

  it('setMetric updates the metric param', () => {
    const { result } = renderHook(() => useCompareState(), {
      wrapper: wrapper('/compare?metric=zhvi'),
    });
    act(() => result.current.setMetric('daysOnMarket'));
    expect(result.current.metric).toBe('daysOnMarket');
  });
});
