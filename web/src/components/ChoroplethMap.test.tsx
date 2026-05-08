import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CountySummary } from '@dmv/shared';

// Mock maplibre-gl before importing ChoroplethMap
const mockOn = vi.fn();
const mockRemove = vi.fn();
const mockAddSource = vi.fn();
const mockAddLayer = vi.fn();
const mockSetFeatureState = vi.fn();
const mockSetPaintProperty = vi.fn();
const mockGetCanvas = vi.fn(() => ({ style: {} }));
const mockIsStyleLoaded = vi.fn(() => true);
const mockOnce = vi.fn();

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      on: mockOn,
      once: mockOnce,
      remove: mockRemove,
      addSource: mockAddSource,
      addLayer: mockAddLayer,
      setFeatureState: mockSetFeatureState,
      setPaintProperty: mockSetPaintProperty,
      getCanvas: mockGetCanvas,
      isStyleLoaded: mockIsStyleLoaded,
    })),
  },
}));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const { ChoroplethMap } = await import('./ChoroplethMap.js');

function makeCounty(fips: string): CountySummary {
  return {
    fips,
    name: `County ${fips}`,
    jurisdiction: 'MD',
    lastUpdated: '2026-01-01',
    current: { zhvi: 500_000, zhviYoY: 0.05 },
    series: {},
  };
}

const MOCK_COUNTIES: CountySummary[] = ['24031', '24027', '11001'].map(makeCounty);

describe('ChoroplethMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsStyleLoaded.mockReturnValue(true);
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ChoroplethMap counties={MOCK_COUNTIES} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Price change/i })).toBeInTheDocument();
  });

  it('renders metric switcher pills', () => {
    render(
      <MemoryRouter>
        <ChoroplethMap counties={MOCK_COUNTIES} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /Home value/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Market health/i })).toBeInTheDocument();
  });

  it('calls setPaintProperty when metric changes', () => {
    render(
      <MemoryRouter>
        <ChoroplethMap counties={MOCK_COUNTIES} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Home value/i }));
    expect(mockSetPaintProperty).toHaveBeenCalled();
  });

  it('shows empty state overlay when no counties provided', () => {
    render(
      <MemoryRouter>
        <ChoroplethMap counties={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading county data/i)).toBeInTheDocument();
  });
});
