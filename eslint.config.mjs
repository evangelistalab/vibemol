export default [{
  ignores: ['assets/vendor/**', 'out/**', 'tests/baselines/evidence/**', 'node_modules/**'],
}, {
  files: ['**/*.{js,mjs,cjs}'],
  rules: { 'no-unreachable': 'error' },
}];
