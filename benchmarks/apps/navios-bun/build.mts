Bun.build({
  entrypoints: ['./src/main.mts'],
  outdir: './bundle',
  target: 'bun',
  format: 'esm',
  packages: 'external',
  // minify: true,
  splitting: true,
  plugins: [
    {
      name: 'decorators',
      setup(build) {
        build.onLoad({ filter: /\.m?(ts|tsx)$/ }, async (args) => {
          const { transform } = await import('@swc/core')
          const code = await Bun.file(args.path).text()
          const result = await transform(code, {
            filename: args.path,
            jsc: {
              target: 'es2022',
              parser: {
                syntax: 'typescript',
                decorators: true,
                tsx: args.path.endsWith('.tsx'),
              },
              transform: {
                decoratorVersion: '2022-03',
              },
            },
            module: {
              type: 'nodenext',
            },
          })
          return { loader: 'js', contents: result.code }
        })
      },
    },
  ],
})
console.log('done')
