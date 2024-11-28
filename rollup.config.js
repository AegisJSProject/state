import terser from '@rollup/plugin-terser';

export default [{
	input: 'state.js',
	output: [{
		file: 'state.cjs',
		format: 'cjs',
	}, {
		file: 'state.mjs',
		format: 'esm',
		plugins: [terser()],
	}]
}];
