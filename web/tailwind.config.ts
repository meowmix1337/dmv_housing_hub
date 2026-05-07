import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // jurisdiction colors used in choropleth + comparisons
        dc: '#dc2626',
        md: '#ca8a04',
        va: '#1d4ed8',
      },
    },
  },
  plugins: [],
} satisfies Config;
